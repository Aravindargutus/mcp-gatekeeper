// TEST FIXTURE: Intentionally contains a fake AWS key (AKIAIOSFODNN7EXAMPLE from AWS docs).
// This is NOT a real credential — it exists to test the secret-scanner validator.
const API_KEY = "AKIAIOSFODNN7EXAMPLE"; // nosec
export const config = { key: API_KEY };
