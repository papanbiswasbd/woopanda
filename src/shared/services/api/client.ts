import { useAuthStore } from '../../store/authStore';

export interface ApiRequestOptions extends RequestInit {
  timeout?: number;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: any;

  constructor(message: string, status: number, code?: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

function getAuthHeaders(credentials: any): Record<string, string> {
  if (!credentials) return {};

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const { authMethod, consumerKey, consumerSecret, jwtToken, username, password } = credentials;

  if (authMethod === 'keys' && consumerKey && consumerSecret) {
    const encoded = btoa(`${consumerKey}:${consumerSecret}`);
    headers['Authorization'] = `Basic ${encoded}`;
  } else if (authMethod === 'jwt' && jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  } else if (authMethod === 'app_password' && username && password) {
    const encoded = btoa(`${username}:${password}`);
    headers['Authorization'] = `Basic ${encoded}`;
  }

  return headers;
}

export async function request<T>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const state = useAuthStore.getState();
  const credentials = state.credentials;

  if (!credentials || !credentials.siteUrl) {
    throw new ApiError('Not authenticated. No site configuration found.', 401);
  }

  // Ensure endpoint doesn't duplicate path if absolute path is passed
  const baseUrl = credentials.siteUrl.endsWith('/')
    ? credentials.siteUrl
    : `${credentials.siteUrl}/`;

  const finalUrl = endpoint.startsWith('http')
    ? endpoint
    : `${baseUrl}wp-json/wc/v3/${endpoint.startsWith('/') ? endpoint.slice(1) : endpoint}`;

  const { timeout = 15000, ...restOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const authHeaders = getAuthHeaders(credentials);
  const config: RequestInit = {
    ...restOptions,
    headers: {
      ...authHeaders,
      ...options.headers,
    },
    signal: controller.signal,
  };

  try {
    const response = await fetch(finalUrl, config);
    clearTimeout(timeoutId);

    const text = await response.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text };
    }

    if (!response.ok) {
      throw new ApiError(
        data.message || `HTTP Error ${response.status}`,
        response.status,
        data.code,
        data
      );
    }

    return data as T;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new ApiError('Request timed out', 408);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error.message || 'Network request failed', 0);
  }
}

export const apiClient = {
  get<T>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    return request<T>(endpoint, { ...options, method: 'GET' });
  },

  post<T>(endpoint: string, body: any, options?: ApiRequestOptions): Promise<T> {
    return request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  put<T>(endpoint: string, body: any, options?: ApiRequestOptions): Promise<T> {
    return request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  delete<T>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    return request<T>(endpoint, { ...options, method: 'DELETE' });
  },
};
