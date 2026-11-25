// The ML service's part of the compose file.
//
// Four containers come with it: the API, a worker running the same image, and
// the Postgres and Redis they share. None is published on the host. The
// platform reaches the API over the compose network and signs every request
// with a secret it writes into a volume of its own, which the ML containers
// mount read-only and which is the only thing of the platform's they see.

export const ML_URL = "http://ml:8001";
export const ML_SECRET_DIR_PLATFORM = "/app/ml-secret";
const ML_SECRET_DIR_SERVICE = "/run/ml-secret";

/** What the platform container gains when the pipeline uses ML. */
export function platformMlSettings() {
  return {
    environment: {
      LEGAL_BLOCKS_ML_URL: ML_URL,
      LEGAL_BLOCKS_ML_SECRET_FILE: `${ML_SECRET_DIR_PLATFORM}/secret`,
    },
    volume: `ml-secret:${ML_SECRET_DIR_PLATFORM}`,
  };
}

export const ML_VOLUMES = ["ml-secret", "ml-models", "ml-data", "ml-postgres"];

export function mlServices(image: string): string[] {
  const environment = [
    "    environment: &ml-environment",
    "      DATABASE_URL: postgresql://ml:ml@ml-postgres:5432/ml",
    "      REDIS_URL: redis://ml-redis:6379/0",
    `      LEGAL_ML_PLATFORM_SECRET_FILE: ${ML_SECRET_DIR_SERVICE}/secret`,
  ];
  const volumes = [
    "    volumes: &ml-volumes",
    `      - ml-secret:${ML_SECRET_DIR_SERVICE}:ro`,
    "      - ml-models:/app/models",
    "      - ml-data:/app/data",
  ];

  return [
    "",
    "  # Trains models and predicts with them. Reached by the platform over the",
    "  # compose network and deliberately not published on your machine.",
    "  ml:",
    `    image: ${image}`,
    "    command: api",
    "    restart: unless-stopped",
    ...environment,
    ...volumes,
    "    depends_on:",
    "      ml-postgres:",
    "        condition: service_healthy",
    "      ml-redis:",
    "        condition: service_healthy",
    "    healthcheck:",
    `      test: ["CMD", "python", "-c", "import urllib.request as u; u.urlopen('http://127.0.0.1:8001/health', timeout=5)"]`,
    "      interval: 10s",
    "      timeout: 6s",
    "      retries: 6",
    "      start_period: 60s",
    "",
    "  # The same image, running the training jobs the API queues.",
    "  ml-worker:",
    `    image: ${image}`,
    "    command: worker",
    "    restart: unless-stopped",
    "    environment: *ml-environment",
    "    volumes: *ml-volumes",
    "    depends_on:",
    "      ml:",
    "        condition: service_healthy",
    "",
    "  ml-postgres:",
    "    image: postgres:15-alpine",
    "    restart: unless-stopped",
    "    environment:",
    "      POSTGRES_USER: ml",
    "      POSTGRES_PASSWORD: ml",
    "      POSTGRES_DB: ml",
    "    volumes:",
    "      - ml-postgres:/var/lib/postgresql/data",
    "    healthcheck:",
    `      test: ["CMD-SHELL", "pg_isready -U ml"]`,
    "      interval: 5s",
    "      timeout: 3s",
    "      retries: 10",
    "",
    "  ml-redis:",
    "    image: redis:7-alpine",
    "    restart: unless-stopped",
    "    healthcheck:",
    `      test: ["CMD", "redis-cli", "ping"]`,
    "      interval: 5s",
    "      timeout: 3s",
    "      retries: 10",
  ];
}
