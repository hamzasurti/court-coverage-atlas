(() => {
  "use strict";

  const state = {
    data: null,
    geography: null,
    view: "map",
    mode: "availability",
    selectedCounty: null,
    selectedCourt: null,
    filters: {
      query: "",
      state: "",
      availability: "",
      market: "",
      network: "",
      scope: "",
    },
    courtPage: 1,
    courtPageSize: 60,
    zoom: null,
    mapRoot: null,
    countyPaths: null,
  };

  const colors = {
    availability: {
      available: "#247557",
      mixed: "#c28b2d",
      unavailable: "#b55245",
      unmapped: "#d9ded6",
    },
    tyler: {
      direct: "#246579",
      market: "#9abec7",
      none: "#dfe3dc",
    },
    market: {
      Open: "#247557",
      Closed: "#46514d",
      Upcoming: "#c28b2d",
      "Privately-Funded": "#a85d42",
      none: "#dfe3dc",
    },
    rollout: {
      pilot: "#17211e",
      "expansion-candidate": "#c28b2d",
      "not-planned": "#dfe3dc",
    },
  };

  const legendDefinitions = {
    availability: [
      ["Available", colors.availability.available],
      ["Mixed", colors.availability.mixed],
      ["Unavailable", colors.availability.unavailable],
      ["Not county-mapped", colors.availability.unmapped],
    ],
    tyler: [
      ["Direct Tyler/Odyssey signal", colors.tyler.direct],
      ["Tyler market only", colors.tyler.market],
      ["No Tyler signal", colors.tyler.none],
    ],
    market: [
      ["Open", colors.market.Open],
      ["Closed", colors.market.Closed],
      ["Upcoming", colors.market.Upcoming],
      ["Privately funded", colors.market["Privately-Funded"]],
      ["No listed market", colors.market.none],
    ],
    rollout: [
      ["California pilot", colors.rollout.pilot],
      ["Open expansion candidate", colors.rollout["expansion-candidate"]],
      ["Not planned", colors.rollout["not-planned"]],
    ],
  };

  const territoryCodes = new Set(["PR", "VI", "AS", "GU", "MP"]);
  const elements = {};

  document.addEventListener("DOMContentLoaded", initialize);

  async function initialize() {
    cacheElements();
    lucide.createIcons();
    bindControls();

    try {
      const [data, geography] = await Promise.all([
        fetch("data/coverage.json?v=20260608-4").then(checkResponse).then((response) => response.json()),
        fetch("data/counties.geojson?v=20260608-4").then(checkResponse).then((response) => response.json()),
      ]);
      state.data = data;
      state.geography = rewindGeographyForD3(geography);
      populateFilters();
      drawMap();
      readUrlState();
      renderAll();
    } catch (error) {
      elements.detailPane.innerHTML = `
        <div class="detail-header">
          <div class="eyebrow"><i data-lucide="triangle-alert"></i>Data load failed</div>
          <h1>Coverage unavailable</h1>
          <p class="detail-subtitle">${escapeHtml(error.message)}</p>
        </div>`;
      lucide.createIcons();
    }
  }

  function checkResponse(response) {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} loading ${response.url}`);
    }
    return response;
  }

  function rewindGeographyForD3(geography) {
    geography.features.forEach((feature) => {
      const geometry = feature.geometry;
      if (geometry.type === "Polygon") {
        geometry.coordinates.forEach((ring) => ring.reverse());
      } else if (geometry.type === "MultiPolygon") {
        geometry.coordinates.forEach((polygon) => {
          polygon.forEach((ring) => ring.reverse());
        });
      }
    });
    return geography;
  }

  function cacheElements() {
    const ids = [
      "snapshot-label", "global-search", "search-results", "state-filter",
      "availability-filter", "market-filter", "network-filter", "scope-filter",
      "reset-filters", "map-view", "courts-view", "map-summary", "county-map",
      "map-stage", "map-tooltip", "map-legend", "detail-pane", "sources-button",
      "share-button", "zoom-in", "zoom-out", "zoom-reset", "court-result-count",
      "court-result-context", "court-table-body", "previous-page", "next-page",
      "page-label", "toast",
    ];
    ids.forEach((id) => {
      elements[toCamel(id)] = document.getElementById(id);
    });
  }

  function bindControls() {
    document.querySelectorAll(".view-tab").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });
    document.querySelectorAll(".mode-button").forEach((button) => {
      button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        document.querySelectorAll(".mode-button").forEach((item) => {
          item.classList.toggle("is-active", item === button);
        });
        updateMapStyles();
        renderLegend();
        updateUrl();
      });
    });

    elements.globalSearch.addEventListener("input", () => {
      state.filters.query = elements.globalSearch.value.trim();
      state.courtPage = 1;
      renderSearchResults();
      renderCourtTable();
    });
    elements.globalSearch.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        elements.searchResults.hidden = true;
      } else if (event.key === "Enter") {
        const first = elements.searchResults.querySelector(".search-result");
        if (first) first.click();
      }
    });

    elements.stateFilter.addEventListener("change", () => {
      state.filters.state = elements.stateFilter.value;
      state.courtPage = 1;
      updateMapStyles();
      renderCourtTable();
      updateUrl();
    });
    elements.availabilityFilter.addEventListener("change", () => {
      state.filters.availability = elements.availabilityFilter.value;
      state.courtPage = 1;
      updateMapStyles();
      renderCourtTable();
      updateUrl();
    });
    elements.marketFilter.addEventListener("change", () => {
      state.filters.market = elements.marketFilter.value;
      state.courtPage = 1;
      updateMapStyles();
      renderCourtTable();
      updateUrl();
    });
    elements.networkFilter.addEventListener("change", () => {
      state.filters.network = elements.networkFilter.value;
      state.courtPage = 1;
      updateMapStyles();
      renderCourtTable();
      updateUrl();
    });
    elements.scopeFilter.addEventListener("change", () => {
      state.filters.scope = elements.scopeFilter.value;
      state.courtPage = 1;
      renderCourtTable();
      updateUrl();
    });

    elements.resetFilters.addEventListener("click", resetFilters);
    elements.sourcesButton.addEventListener("click", renderSources);
    elements.shareButton.addEventListener("click", copyShareLink);
    elements.previousPage.addEventListener("click", () => changePage(-1));
    elements.nextPage.addEventListener("click", () => changePage(1));

    elements.zoomIn.addEventListener("click", () => zoomBy(1.35));
    elements.zoomOut.addEventListener("click", () => zoomBy(0.74));
    elements.zoomReset.addEventListener("click", resetZoom);

    elements.detailPane.addEventListener("click", handleDetailClick);
    elements.courtTableBody.addEventListener("click", (event) => {
      const row = event.target.closest("tr[data-court-id]");
      if (row) selectCourt(Number(row.dataset.courtId));
    });
    elements.courtTableBody.addEventListener("keydown", (event) => {
      const row = event.target.closest("tr[data-court-id]");
      if (row && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        selectCourt(Number(row.dataset.courtId));
      }
    });
    elements.searchResults.addEventListener("click", handleSearchResultClick);

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".search-wrap")) {
        elements.searchResults.hidden = true;
      }
    });
    window.addEventListener("popstate", readUrlState);
  }

  function populateFilters() {
    const states = Object.values(state.data.states)
      .sort((a, b) => a.state_name.localeCompare(b.state_name));
    elements.stateFilter.insertAdjacentHTML(
      "beforeend",
      states.map((item) => `<option value="${item.state}">${escapeHtml(item.state_name)}</option>`).join(""),
    );

    const networks = Object.keys(state.data.meta.network_counts).sort();
    elements.networkFilter.insertAdjacentHTML(
      "beforeend",
      networks.map((network) => `<option value="${escapeAttribute(network)}">${escapeHtml(network)}</option>`).join(""),
    );

    elements.snapshotLabel.textContent =
      `Snapshot ${formatDate(state.data.meta.snapshot_date)} · ${formatNumber(state.data.meta.counts.counties)} county equivalents`;
  }

  function drawMap() {
    const svg = d3.select(elements.countyMap);
    const mapRoot = svg.append("g").attr("class", "map-root");
    state.mapRoot = mapRoot;

    const mainFeatures = state.geography.features.filter(
      (feature) => !territoryCodes.has(feature.properties.STUSPS),
    );
    const mainProjection = d3.geoAlbersUsa().fitExtent(
      [[20, 18], [980, 520]],
      { type: "FeatureCollection", features: mainFeatures },
    );
    const mainPath = d3.geoPath(mainProjection);
    drawFeatureGroup(mapRoot.append("g").attr("class", "mainland"), mainFeatures, mainPath);

    const insets = [
      { codes: ["PR", "VI"], label: "Puerto Rico & U.S. Virgin Islands", box: [590, 530, 195, 105] },
      { codes: ["AS"], label: "American Samoa", box: [795, 530, 78, 105] },
      { codes: ["GU", "MP"], label: "Guam & Northern Mariana Islands", box: [883, 530, 107, 105] },
    ];

    insets.forEach((inset) => {
      const features = state.geography.features.filter((feature) =>
        inset.codes.includes(feature.properties.STUSPS));
      const [x, y, width, height] = inset.box;
      const projection = d3.geoMercator().fitExtent(
        [[x + 6, y + 19], [x + width - 6, y + height - 5]],
        { type: "FeatureCollection", features },
      );
      const group = mapRoot.append("g").attr("class", "territory-inset");
      group.append("rect")
        .attr("class", "inset-frame")
        .attr("x", x)
        .attr("y", y)
        .attr("width", width)
        .attr("height", height)
        .attr("rx", 4);
      group.append("text")
        .attr("class", "inset-label")
        .attr("x", x + 7)
        .attr("y", y + 13)
        .text(inset.label);
      drawFeatureGroup(group, features, d3.geoPath(projection));
    });

    state.countyPaths = mapRoot.selectAll(".county-path");
    state.zoom = d3.zoom()
      .scaleExtent([1, 9])
      .on("zoom", (event) => {
        mapRoot.attr("transform", event.transform);
      });
    svg.call(state.zoom);
  }

  function drawFeatureGroup(group, features, path) {
    group.selectAll("path")
      .data(features)
      .join("path")
      .attr("class", "county-path")
      .attr("d", path)
      .attr("data-geoid", (feature) => feature.properties.GEOID)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", (feature) => feature.properties.NAMELSAD)
      .on("pointerenter pointermove", showTooltip)
      .on("pointerleave", hideTooltip)
      .on("click", (_, feature) => selectCounty(feature.properties.GEOID))
      .on("keydown", (event, feature) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectCounty(feature.properties.GEOID);
        }
      });
  }

  function renderAll() {
    updateViewControls();
    updateFilterControls();
    updateMapStyles();
    renderLegend();
    renderCourtTable();

    if (state.selectedCourt !== null) {
      renderCourtDetail(state.data.courts[state.selectedCourt]);
    } else if (state.selectedCounty) {
      renderCountyDetail(state.data.counties[state.selectedCounty]);
    } else {
      renderNationalOverview();
    }
    lucide.createIcons();
  }

  function setView(view, updateHistory = true) {
    state.view = view === "courts" ? "courts" : "map";
    updateViewControls();
    if (state.view === "courts") renderCourtTable();
    if (updateHistory) updateUrl();
  }

  function updateViewControls() {
    document.querySelectorAll(".view-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === state.view);
    });
    elements.mapView.classList.toggle("is-active", state.view === "map");
    elements.courtsView.classList.toggle("is-active", state.view === "courts");
  }

  function updateFilterControls() {
    elements.globalSearch.value = state.filters.query;
    elements.stateFilter.value = state.filters.state;
    elements.availabilityFilter.value = state.filters.availability;
    elements.marketFilter.value = state.filters.market;
    elements.networkFilter.value = state.filters.network;
    elements.scopeFilter.value = state.filters.scope;
    document.querySelectorAll(".mode-button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === state.mode);
    });
  }

  function countyColor(county) {
    if (state.mode === "availability") {
      return colors.availability[county.availability];
    }
    if (state.mode === "tyler") {
      if (county.tyler_court_count > 0) return colors.tyler.direct;
      if (county.market_status) return colors.tyler.market;
      return colors.tyler.none;
    }
    if (state.mode === "market") {
      return colors.market[county.market_status || "none"];
    }
    return colors.rollout[county.rollout];
  }

  function countyMatchesFilters(county) {
    if (state.filters.state && county.state !== state.filters.state) return false;
    if (state.filters.availability && county.availability !== state.filters.availability) return false;
    if (state.filters.market) {
      const status = county.market_status || "none";
      if (status !== state.filters.market) return false;
    }
    if (state.filters.network && !county.networks[state.filters.network]) return false;
    return true;
  }

  function updateMapStyles() {
    if (!state.countyPaths || !state.data) return;
    let visible = 0;
    state.countyPaths
      .attr("fill", (feature) => countyColor(state.data.counties[feature.properties.GEOID]))
      .attr("opacity", (feature) => {
        const matches = countyMatchesFilters(state.data.counties[feature.properties.GEOID]);
        if (matches) visible += 1;
        return matches ? 1 : 0.12;
      })
      .classed("is-selected", (feature) => feature.properties.GEOID === state.selectedCounty);
    elements.mapSummary.textContent =
      `${formatNumber(visible)} of ${formatNumber(state.data.meta.counts.counties)} counties`;
  }

  function renderLegend() {
    elements.mapLegend.innerHTML = legendDefinitions[state.mode]
      .map(([label, color]) => `
        <span class="legend-item">
          <span class="legend-swatch" style="background:${color}"></span>
          ${escapeHtml(label)}
        </span>`)
      .join("");
  }

  function showTooltip(event, feature) {
    const county = state.data.counties[feature.properties.GEOID];
    const status = availabilityLabel(county.availability);
    elements.mapTooltip.innerHTML = `
      <strong>${escapeHtml(county.full_name)}</strong>
      <span>${escapeHtml(county.state_name)} · ${escapeHtml(status)}</span>
      <span>${formatNumber(county.court_ids.length)} county-linked court records</span>`;
    elements.mapTooltip.hidden = false;
    positionTooltip(event);
  }

  function positionTooltip(event) {
    const stage = elements.mapStage.getBoundingClientRect();
    const tooltip = elements.mapTooltip.getBoundingClientRect();
    const x = Math.min(event.clientX - stage.left + 14, stage.width - tooltip.width - 8);
    const y = Math.min(event.clientY - stage.top + 14, stage.height - tooltip.height - 8);
    elements.mapTooltip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }

  function hideTooltip() {
    elements.mapTooltip.hidden = true;
  }

  function selectCounty(geoid, updateHistory = true) {
    const county = state.data.counties[geoid];
    if (!county) return;
    state.selectedCounty = geoid;
    state.selectedCourt = null;
    renderCountyDetail(county);
    updateMapStyles();
    if (state.view !== "map") setView("map", false);
    if (updateHistory) updateUrl();
    if (window.innerWidth <= 820) {
      elements.detailPane.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function selectCourt(courtId, updateHistory = true) {
    const court = state.data.courts[courtId];
    if (!court) return;
    state.selectedCourt = courtId;
    state.selectedCounty = court.county_matches.length === 1
      ? court.county_matches[0].geoid
      : null;
    renderCourtDetail(court);
    updateMapStyles();
    if (updateHistory) updateUrl();
  }

  function renderNationalOverview() {
    const counts = state.data.meta.counts;
    const unresolved = state.data.meta.scope_counts["state-record-unresolved"];
    elements.detailPane.innerHTML = `
      <div class="detail-header">
        <div class="eyebrow"><i data-lucide="map"></i>National snapshot</div>
        <h1>U.S. court coverage</h1>
        <p class="detail-subtitle">County equivalents, filing availability, networks, Tyler markets, and certification posture.</p>
        <div class="tag-row">
          <span class="tag">Census 2025</span>
          <span class="tag">Source snapshot ${escapeHtml(formatDate(state.data.meta.snapshot_date))}</span>
        </div>
      </div>
      <div class="detail-metrics">
        ${metric(counts.counties, "Counties")}
        ${metric(counts.courts, "Courts")}
        ${metric(counts.courts_supporting_efiling, "E-filing")}
      </div>
      <section class="detail-section">
        <div class="section-heading"><h2>Coverage integrity</h2></div>
        <dl class="fact-list">
          ${fact("County-linked", formatNumber(counts.counties_with_direct_court_matches))}
          ${fact("Tyler signals", formatNumber(counts.counties_with_tyler_signals))}
          ${fact("Tyler markets", formatNumber(counts.tyler_markets))}
          ${fact("Unresolved courts", formatNumber(unresolved))}
        </dl>
        <p>Unresolved records remain in the court index. They are not converted into false county assignments.</p>
      </section>
      <section class="detail-section">
        <div class="section-heading"><h2>Product posture</h2></div>
        <div class="notice">${escapeHtml(state.data.product.certification_status)}</div>
        <p>${escapeHtml(state.data.product.strategy)} The map shows court and market evidence, not live product availability.</p>
      </section>
      <section class="detail-section">
        <button class="text-button" type="button" data-action="sources"><i data-lucide="book-open"></i>Review sources and matching method</button>
      </section>`;
    lucide.createIcons();
  }

  function renderCountyDetail(county) {
    const stateSummary = state.data.states[county.state];
    const market = stateSummary && stateSummary.market;
    const courts = county.court_ids.map((id) => state.data.courts[id]);
    const inferred = county.match_confidence["name-inferred"] || 0;
    const localCourtMarkup = courts.length
      ? courts.map(courtListItem).join("")
      : `<div class="notice">No uploaded court record contains enough geography for a direct county link. This is not a finding that the county lacks courts or e-filing.</div>`;

    const marketMarkup = market
      ? `
        <dl class="fact-list">
          ${fact("Access", marketStatusChip(market.status))}
          ${fact("Stage", externalLink(market.stage_url))}
          ${fact("Production", externalLink(market.production_url))}
          ${market.deployments.map((deployment) =>
            fact(
              deployment.realm || "Deployment",
              `${escapeHtml(deployment.version || "Unknown")} · ${escapeHtml(deployment.status || "Unknown")} · ${escapeHtml(formatDate(deployment.start))}`,
            )).join("")}
        </dl>`
      : `<p>No Tyler EFM market is listed for this state in the uploaded market workbook.</p>`;

    elements.detailPane.innerHTML = `
      <div class="detail-header">
        <div class="eyebrow"><i data-lucide="map-pin"></i>${escapeHtml(county.state_name)} · FIPS ${escapeHtml(county.geoid)}</div>
        <h1>${escapeHtml(county.full_name)}</h1>
        <p class="detail-subtitle">${escapeHtml(availabilitySentence(county))}</p>
        <div class="tag-row">
          ${availabilityChip(county.availability)}
          ${county.tyler_court_count ? `<span class="status-chip yes">${formatNumber(county.tyler_court_count)} Tyler-linked</span>` : ""}
          ${market ? marketStatusChip(market.status) : `<span class="tag">No Tyler market</span>`}
        </div>
      </div>
      <div class="detail-metrics">
        ${metric(county.court_ids.length, "Linked courts")}
        ${metric(county.efiling_yes, "E-filing")}
        ${metric(county.efiling_no, "No e-filing")}
      </div>
      <section class="detail-section">
        <div class="section-heading">
          <h2>County-linked courts</h2>
          ${courts.length ? `<button class="text-button" type="button" data-action="filter-county" data-geoid="${county.geoid}">Open index</button>` : ""}
        </div>
        ${inferred ? `<div class="notice">${formatNumber(inferred)} link${inferred === 1 ? "" : "s"} inferred from a unique county name and local court type.</div>` : ""}
        <div class="court-list">${localCourtMarkup}</div>
      </section>
      <section class="detail-section">
        <div class="section-heading"><h2>Tyler market</h2></div>
        ${marketMarkup}
        ${stateSummary && stateSummary.product_note ? `<p>${escapeHtml(stateSummary.product_note)}</p>` : ""}
      </section>
      <section class="detail-section">
        <div class="section-heading"><h2>State and federal records</h2></div>
        <dl class="fact-list">
          ${fact("Federal", formatNumber(stateSummary ? stateSummary.federal_court_ids.length : 0))}
          ${fact("Appellate", formatNumber(stateSummary ? stateSummary.appellate_court_ids.length : 0))}
          ${fact("Unresolved local", formatNumber(stateSummary ? stateSummary.unresolved_court_ids.length : 0))}
        </dl>
        <button class="text-button" type="button" data-action="filter-state" data-state="${county.state}"><i data-lucide="list"></i>View all ${escapeHtml(county.state_name)} records</button>
      </section>
      <section class="detail-section">
        <div class="section-heading"><h2>Method</h2></div>
        <p>${escapeHtml(state.data.meta.method.exact)} ${escapeHtml(state.data.meta.method.inferred)}</p>
      </section>`;
    lucide.createIcons();
  }

  function renderCourtDetail(court) {
    const countyLinks = court.county_matches.length
      ? court.county_matches.map((match) => {
          const county = state.data.counties[match.geoid];
          return `<button class="court-list-item" type="button" data-county-id="${match.geoid}">
            <span><strong>${escapeHtml(county.full_name)}</strong><span>${escapeHtml(county.state_name)} · ${escapeHtml(match.confidence)}</span></span>
            <i data-lucide="arrow-up-right"></i>
          </button>`;
        }).join("")
      : `<div class="notice">${escapeHtml(state.data.meta.method.unresolved)}</div>`;

    elements.detailPane.innerHTML = `
      <div class="detail-header">
        <div class="eyebrow"><i data-lucide="landmark"></i>${escapeHtml(scopeLabel(court.scope))}</div>
        <h1>${escapeHtml(court.name)}</h1>
        <p class="detail-subtitle">${escapeHtml(court.state_label)}</p>
        <div class="tag-row">
          <span class="status-chip ${court.supports_efiling ? "yes" : "no"}">${court.supports_efiling ? "E-filing available" : "No e-filing"}</span>
          ${court.tyler_signaled ? `<span class="status-chip yes">Tyler/Odyssey signal</span>` : ""}
        </div>
      </div>
      <section class="detail-section">
        <div class="section-heading"><h2>Filing system</h2></div>
        <dl class="fact-list">
          ${fact("Manager", escapeHtml(court.manager))}
          ${fact("Network", escapeHtml(court.network))}
          ${fact("Scope", escapeHtml(scopeLabel(court.scope)))}
          ${fact("Source row", `#${court.id + 2}`)}
        </dl>
      </section>
      <section class="detail-section">
        <div class="section-heading"><h2>County links</h2></div>
        <div class="court-list">${countyLinks}</div>
      </section>
      <section class="detail-section">
        <button class="text-button" type="button" data-action="open-courts"><i data-lucide="list"></i>Return to court index</button>
      </section>`;
    lucide.createIcons();
  }

  function renderSources() {
    state.selectedCourt = null;
    state.selectedCounty = null;
    updateMapStyles();
    elements.detailPane.innerHTML = `
      <div class="detail-header">
        <div class="eyebrow"><i data-lucide="book-open"></i>Provenance</div>
        <h1>Sources & method</h1>
        <p class="detail-subtitle">Facts, derived geographic links, and product decisions are kept separate.</p>
      </div>
      <section class="detail-section">
        <div class="source-list">
          ${state.data.sources.map((source) => `
            <div class="source-item">
              <strong>${escapeHtml(source.name)}</strong>
              <span>${escapeHtml(source.role)}</span>
              ${source.url ? `<a href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">Open official source</a>` : `<span>${escapeHtml(source.file)}</span>`}
            </div>`).join("")}
        </div>
      </section>
      <section class="detail-section">
        <div class="section-heading"><h2>County matching</h2></div>
        <dl class="fact-list">
          ${fact("Exact", escapeHtml(state.data.meta.method.exact))}
          ${fact("Inferred", escapeHtml(state.data.meta.method.inferred))}
          ${fact("Unresolved", escapeHtml(state.data.meta.method.unresolved))}
        </dl>
      </section>
      <section class="detail-section">
        <div class="section-heading"><h2>Important boundary</h2></div>
        <div class="notice">A Tyler-operated court or Tyler market does not mean this product is certified or live there. Current product certification status: ${escapeHtml(state.data.product.certification_status)}</div>
      </section>`;
    lucide.createIcons();
    updateUrl();
  }

  function courtListItem(court) {
    return `
      <button class="court-list-item" type="button" data-court-id="${court.id}">
        <span>
          <strong>${escapeHtml(court.name)}</strong>
          <span>${escapeHtml(court.manager)}</span>
        </span>
        <span class="court-status ${court.supports_efiling ? "yes" : ""}" aria-label="${court.supports_efiling ? "E-filing available" : "No e-filing"}"></span>
      </button>`;
  }

  function filteredCourts() {
    const query = normalize(state.filters.query);
    return state.data.courts.filter((court) => {
      if (state.filters.state && !court.states.includes(state.filters.state)) return false;
      if (state.filters.scope && court.scope !== state.filters.scope) return false;
      if (state.filters.network && court.network !== state.filters.network) return false;
      if (state.filters.availability === "available" && !court.supports_efiling) return false;
      if (state.filters.availability === "unavailable" && court.supports_efiling) return false;
      if (state.filters.market) {
        const statuses = court.states.map((item) => state.data.markets[item]?.status || "none");
        if (!statuses.includes(state.filters.market)) return false;
      }
      if (query) {
        const haystack = normalize(`${court.name} ${court.state_label} ${court.manager} ${court.network}`);
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function renderCourtTable() {
    if (!state.data) return;
    const courts = filteredCourts();
    const totalPages = Math.max(1, Math.ceil(courts.length / state.courtPageSize));
    state.courtPage = Math.min(state.courtPage, totalPages);
    const start = (state.courtPage - 1) * state.courtPageSize;
    const page = courts.slice(start, start + state.courtPageSize);

    elements.courtTableBody.innerHTML = page.length
      ? page.map((court) => `
          <tr data-court-id="${court.id}" tabindex="0">
            <td>${escapeHtml(court.name)}</td>
            <td>${escapeHtml(court.state_label)}</td>
            <td><span class="status-chip ${court.supports_efiling ? "yes" : "no"}">${court.supports_efiling ? "Yes" : "No"}</span></td>
            <td>${escapeHtml(court.manager)}</td>
            <td>${escapeHtml(scopeLabel(court.scope))}</td>
          </tr>`).join("")
      : `<tr><td colspan="5">No court records match the active filters.</td></tr>`;

    elements.courtResultCount.textContent = `${formatNumber(courts.length)} courts`;
    elements.courtResultContext.textContent =
      courts.length === state.data.courts.length ? "All uploaded records" : "Filtered source records";
    elements.pageLabel.textContent = `Page ${state.courtPage} of ${totalPages}`;
    elements.previousPage.disabled = state.courtPage <= 1;
    elements.nextPage.disabled = state.courtPage >= totalPages;
  }

  function changePage(delta) {
    state.courtPage = Math.max(1, state.courtPage + delta);
    renderCourtTable();
    document.querySelector(".court-table-wrap").scrollTop = 0;
  }

  function renderSearchResults() {
    if (!state.data) return;
    const query = normalize(state.filters.query);
    if (query.length < 2) {
      elements.searchResults.hidden = true;
      return;
    }

    const counties = Object.values(state.data.counties)
      .filter((county) => normalize(`${county.full_name} ${county.state_name} ${county.state}`).includes(query))
      .slice(0, 6);
    const courts = state.data.courts
      .filter((court) => normalize(`${court.name} ${court.state_label} ${court.manager}`).includes(query))
      .slice(0, 8);

    const results = [
      ...counties.map((county) => `
        <button class="search-result" type="button" data-county-id="${county.geoid}">
          <strong>${escapeHtml(county.full_name)}</strong>
          <span>${escapeHtml(county.state_name)} · County</span>
        </button>`),
      ...courts.map((court) => `
        <button class="search-result" type="button" data-court-id="${court.id}">
          <strong>${escapeHtml(court.name)}</strong>
          <span>${escapeHtml(court.state_label)} · Court</span>
        </button>`),
    ];

    elements.searchResults.innerHTML = results.length
      ? results.join("")
      : `<div class="search-empty">No counties or courts found</div>`;
    elements.searchResults.hidden = false;
  }

  function handleSearchResultClick(event) {
    const button = event.target.closest(".search-result");
    if (!button) return;
    elements.searchResults.hidden = true;
    if (button.dataset.countyId) selectCounty(button.dataset.countyId);
    if (button.dataset.courtId) selectCourt(Number(button.dataset.courtId));
  }

  function handleDetailClick(event) {
    const countyButton = event.target.closest("[data-county-id]");
    const courtButton = event.target.closest("[data-court-id]");
    const actionButton = event.target.closest("[data-action]");
    if (countyButton) {
      selectCounty(countyButton.dataset.countyId);
      return;
    }
    if (courtButton) {
      selectCourt(Number(courtButton.dataset.courtId));
      return;
    }
    if (!actionButton) return;

    const action = actionButton.dataset.action;
    if (action === "sources") renderSources();
    if (action === "open-courts") setView("courts");
    if (action === "filter-state") {
      state.filters.state = actionButton.dataset.state;
      state.courtPage = 1;
      updateFilterControls();
      setView("courts");
      renderCourtTable();
    }
    if (action === "filter-county") {
      const county = state.data.counties[actionButton.dataset.geoid];
      state.filters.query = county.name;
      state.filters.state = county.state;
      state.filters.scope = "county-linked";
      state.courtPage = 1;
      updateFilterControls();
      setView("courts");
      renderCourtTable();
    }
  }

  function resetFilters() {
    state.filters = {
      query: "",
      state: "",
      availability: "",
      market: "",
      network: "",
      scope: "",
    };
    state.courtPage = 1;
    updateFilterControls();
    updateMapStyles();
    renderCourtTable();
    updateUrl();
  }

  function zoomBy(scale) {
    if (!state.zoom) return;
    d3.select(elements.countyMap)
      .transition()
      .duration(180)
      .call(state.zoom.scaleBy, scale);
  }

  function resetZoom() {
    if (!state.zoom) return;
    d3.select(elements.countyMap)
      .transition()
      .duration(220)
      .call(state.zoom.transform, d3.zoomIdentity);
  }

  function readUrlState() {
    if (!state.data) return;
    const params = new URLSearchParams(window.location.search);
    state.view = params.get("view") === "courts" ? "courts" : "map";
    state.mode = ["availability", "tyler", "market", "rollout"].includes(params.get("mode"))
      ? params.get("mode")
      : "availability";
    state.filters.state = params.get("state") || "";
    state.filters.availability = params.get("filing") || "";
    state.filters.market = params.get("market") || "";
    state.filters.network = params.get("network") || "";
    state.filters.scope = params.get("scope") || "";
    state.filters.query = params.get("q") || "";
    state.selectedCounty = state.data.counties[params.get("county")] ? params.get("county") : null;
    const courtParam = params.get("court");
    const courtId = courtParam === null ? null : Number(courtParam);
    state.selectedCourt = Number.isInteger(courtId) && state.data.courts[courtId] ? courtId : null;
    renderAll();
  }

  function updateUrl() {
    const params = new URLSearchParams();
    if (state.view !== "map") params.set("view", state.view);
    if (state.mode !== "availability") params.set("mode", state.mode);
    if (state.selectedCounty) params.set("county", state.selectedCounty);
    if (state.selectedCourt !== null) params.set("court", state.selectedCourt);
    if (state.filters.state) params.set("state", state.filters.state);
    if (state.filters.availability) params.set("filing", state.filters.availability);
    if (state.filters.market) params.set("market", state.filters.market);
    if (state.filters.network) params.set("network", state.filters.network);
    if (state.filters.scope) params.set("scope", state.filters.scope);
    if (state.filters.query) params.set("q", state.filters.query);
    const query = params.toString();
    history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }

  async function copyShareLink() {
    updateUrl();
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Share link copied");
    } catch {
      showToast("Copy unavailable; use the address bar");
    }
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => elements.toast.classList.remove("is-visible"), 1800);
  }

  function availabilityLabel(value) {
    return {
      available: "E-filing available",
      mixed: "Mixed filing availability",
      unavailable: "No e-filing in linked records",
      unmapped: "No county-linked records",
    }[value];
  }

  function availabilitySentence(county) {
    if (county.availability === "unmapped") {
      return "No uploaded record can be assigned directly to this county from the available geography.";
    }
    return `${formatNumber(county.efiling_yes)} linked record${county.efiling_yes === 1 ? "" : "s"} support e-filing; ${formatNumber(county.efiling_no)} do not.`;
  }

  function availabilityChip(value) {
    return `<span class="status-chip ${value}">${escapeHtml(availabilityLabel(value))}</span>`;
  }

  function marketStatusChip(status) {
    const className = status === "Open"
      ? "open"
      : status === "Upcoming"
        ? "upcoming"
        : status === "Privately-Funded"
          ? "private"
          : "";
    return `<span class="status-chip ${className}">${escapeHtml(status)}</span>`;
  }

  function scopeLabel(scope) {
    return {
      "county-linked": "County-linked",
      "state-record-unresolved": "Unresolved local",
      "appellate-or-statewide": "Appellate/statewide",
      federal: "Federal",
    }[scope] || scope;
  }

  function externalLink(url) {
    if (!url) return "Not listed";
    return `<a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">${escapeHtml(url.replace(/^https?:\/\//, ""))}</a>`;
  }

  function metric(value, label) {
    return `<div class="detail-metric"><strong>${formatNumber(value)}</strong><span>${escapeHtml(label)}</span></div>`;
  }

  function fact(label, value) {
    return `<div class="fact-row"><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value || 0);
  }

  function formatDate(value) {
    if (!value) return "Unknown";
    const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function toCamel(value) {
    return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
})();
