-- Local/test bootstrap only. Production uses provisioned roles and secret management.
CREATE ROLE zipp_app LOGIN PASSWORD 'local_app_only';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO zipp_app;
