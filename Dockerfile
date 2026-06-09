FROM rust:1.88-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
COPY static ./static
RUN cargo build --release

FROM debian:bookworm-slim
RUN useradd --create-home --uid 10001 atlas
COPY --from=builder /app/target/release/court-coverage-atlas /usr/local/bin/atlas
USER atlas
ENV PORT=3000
EXPOSE 3000
CMD ["/usr/local/bin/atlas"]
