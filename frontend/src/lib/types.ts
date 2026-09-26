export type Status = "online" | "offline" | "warning" | "unknown" | "not_configured";

export interface User {
  id: string;
  email: string;
  name: string;
  last_login_at: string | null;
}

export interface Me {
  user: User;
  csrf_token: string;
  session_expires_at: string;
}

export interface Application {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: "active" | "disabled";
  rate_limit_rpm: number | null;
  monthly_token_quota: number | null;
  created_at: string;
  updated_at: string;
  key_count: number;
  active_key_count: number;
  last_used_at: string | null;
  requests_30d: number;
}

export type Permission = "chat" | "models";

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  masked_key: string;
  environment: "live" | "test";
  permissions: Permission[];
  status: "active" | "revoked";
  effective_status: "active" | "revoked" | "expired";
  application_id: string;
  application_name: string;
  rate_limit_rpm: number | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
}

export interface ApiKeyCreated extends ApiKey {
  key: string;
}

export interface RequestLog {
  id: number;
  created_at: string;
  application_id: string | null;
  application_name: string | null;
  api_key_id: string | null;
  api_key_name: string | null;
  key_prefix: string | null;
  endpoint: string;
  method: string;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  processing_ms: number;
  status_code: number;
  status: "success" | "error";
  error: string | null;
  client_ip: string | null;
  request_content?: string | null;
  response_content?: string | null;
}

export interface Totals {
  requests: number;
  errors: number;
  tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  avg_latency_ms: number;
  error_rate: number;
}

export interface SeriesPoint extends Totals {
  bucket: string;
}

export interface Usage {
  range: { start: string; end: string; granularity: "hour" | "day"; timezone: string };
  totals: Totals;
  series: SeriesPoint[];
  by_application: (Totals & { application_id: string | null; name: string })[];
  by_model: (Totals & { model: string })[];
}

export interface Overview {
  api_status: Status;
  ollama_status: Status;
  default_model: string;
  timezone: string;
  total_requests: number;
  today: Totals;
  today_series: SeriesPoint[];
  recent_requests: RequestLog[];
}

export interface ModelInfo {
  name: string;
  size: number | null;
  modified_at: string | null;
  digest: string;
  family: string | null;
  parameter_size: string | null;
  quantization: string | null;
  format: string | null;
  is_default: boolean;
  allowed: boolean;
  loaded: boolean;
  loaded_size_vram: number | null;
  loaded_until: string | null;
}

export interface ModelsResponse {
  ollama_status: Status;
  error: string | null;
  default_model: string;
  default_installed?: boolean;
  models: ModelInfo[];
}

export interface SystemCheck {
  id: string;
  label: string;
  status: Status;
  detail: string;
  latency_ms: number | null;
}

export interface SystemStatus {
  checked_at: string;
  checks: SystemCheck[];
  host: {
    hostname: string;
    arch: string;
    python: string;
    memory: { total: number; available: number } | null;
    swap: { total: number; free: number } | null;
    disk: { total: number; free: number } | null;
    load: number[] | null;
    cpus?: number;
    uptime_seconds: number | null;
  };
  versions: { ollama: string | null };
}

export interface PlatformSettings {
  public_base_url: string;
  default_model: string;
  allowed_models: string[];
  ollama_max_concurrency: number;
  legacy_api_key_enabled: boolean;
  log_request_content: boolean;
  max_messages: number;
  max_input_chars: number;
  session_ttl_hours: number;
  dashboard_timezone: string;
  sessions: {
    id: string;
    created_at: string;
    last_seen_at: string;
    expires_at: string;
    ip: string | null;
    user_agent: string | null;
    current: boolean;
  }[];
}
