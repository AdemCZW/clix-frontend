/**
 * API 工具模組
 * 處理 JWT Token 自動刷新、統一 Authorization Header
 *
 * 開發環境：Vite proxy 將 /api/* 轉發到後端（無 CORS 問題）
 * 正式環境：透過 VITE_API_BASE_URL 環境變數指定後端完整 URL
 */

// 開發環境用相對路徑（Vite proxy 處理），正式環境用環境變數
// 移除結尾斜線，避免拼接路徑時出現雙斜線
const BASE_URL =
    (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

/**
 * 取得當前請求 headers（帶 Token）
 */
const getHeaders = () => {
    const token = localStorage.getItem('access_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
};

/**
 * 使用 refresh_token 刷新 access_token
 */
const refreshAccessToken = async() => {
    const refresh = localStorage.getItem('refresh_token');
    if (!refresh) throw new Error('No refresh token');

    const res = await fetch(`${BASE_URL}/api/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
    });

    if (!res.ok) throw new Error('Token refresh failed');

    const data = await res.json();
    localStorage.setItem('access_token', data.access);
    return data.access;
};

/**
 * 統一 API 請求，自動處理 401 → Token 刷新 → 重試
 * @param {string} path    - API 路徑，如 '/api/managers/'
 * @param {object} options - fetch options
 */
export const apiRequest = async(path, options = {}) => {
    const url = `${BASE_URL}${path}`;

    // 若 body 是 FormData，讓瀏覽器自動設定 Content-Type（含 boundary）
    // 否則統一帶 application/json
    const isFormData = options.body instanceof FormData;
    const makeHeaders = () => {
        const token = localStorage.getItem('access_token');
        const auth = token ? { Authorization: `Bearer ${token}` } : {};
        if (isFormData) {
            return {...auth, ...options.headers };
        }
        return {...getHeaders(), ...options.headers };
    };

    let response = await fetch(url, {
        ...options,
        headers: makeHeaders(),
    });

    // 若 401，嘗試刷新 token 後重試一次
    if (response.status === 401) {
        try {
            await refreshAccessToken();
            response = await fetch(url, {
                ...options,
                headers: makeHeaders(),
            });
        } catch {
            // refresh 失敗，清除憑證並跳轉登入
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user_data');
            window.location.href = '/#/login';
            throw new Error('Authentication expired, please login again');
        }
    }

    return response;
};

export const API_BASE_URL = BASE_URL;
