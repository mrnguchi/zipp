CREATE TABLE "platform_metadata" (
    "key" VARCHAR(100) NOT NULL,
    "value" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_metadata_pkey" PRIMARY KEY ("key")
);

INSERT INTO "platform_metadata" ("key", "value") VALUES ('foundation', 'm0');

-- Runtime can inspect readiness but cannot mutate migrations or create schema objects.
GRANT SELECT ON "platform_metadata" TO zipp_app;
