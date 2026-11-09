function isAdminErrorDetails(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    if (typeof candidate.code !== 'string' || typeof candidate.message !== 'string')
        return false;
    if (candidate.issues === undefined)
        return true;
    return Array.isArray(candidate.issues) && candidate.issues.every((issue) => (!!issue
        && typeof issue === 'object'
        && typeof issue.path === 'string'
        && typeof issue.code === 'string'
        && typeof issue.message === 'string'));
}
function resolveBaseUrl(requestedBase) {
    const browserOrigin = typeof globalThis.location === 'object' ? globalThis.location.origin : undefined;
    const baseUrl = requestedBase ?? browserOrigin;
    if (!baseUrl)
        throw new TypeError('baseUrl is required outside a browser');
    const parsedBase = new URL(baseUrl);
    if (browserOrigin && parsedBase.origin !== browserOrigin) {
        throw new TypeError('LocalHttpAdminProvider requires the current page origin');
    }
    if (parsedBase.hostname !== '127.0.0.1') {
        throw new TypeError('LocalHttpAdminProvider requires a 127.0.0.1 origin');
    }
    if (parsedBase.protocol !== 'http:' && parsedBase.protocol !== 'https:') {
        throw new TypeError('baseUrl must use HTTP or HTTPS');
    }
    return parsedBase.origin;
}
function resolveFetch(fetchImpl) {
    const defaultFetch = globalThis.fetch?.bind(globalThis);
    const resolved = fetchImpl ?? defaultFetch;
    if (!resolved)
        throw new TypeError('fetch is unavailable');
    return resolved;
}
export class AdminProviderError extends Error {
    constructor(details, status = details.status ?? 0) {
        super(details.message);
        this.name = 'AdminProviderError';
        this.code = details.code;
        this.issues = details.issues;
        this.status = status;
    }
    toDetails() {
        return {
            code: this.code,
            message: this.message,
            ...(this.issues ? { issues: this.issues } : {}),
            status: this.status,
        };
    }
}
export class LocalHttpAdminProvider {
    static async connect(options = {}) {
        const baseUrl = resolveBaseUrl(options.baseUrl);
        const fetchImpl = resolveFetch(options.fetchImpl);
        let response;
        try {
            response = await fetchImpl(`${baseUrl}/api/session`, {
                method: 'POST',
                headers: { Accept: 'application/json' },
                mode: 'same-origin',
                credentials: 'same-origin',
                redirect: 'error',
                cache: 'no-store',
            });
        }
        catch (error) {
            throw new AdminProviderError({
                code: 'NETWORK_ERROR',
                message: error instanceof Error ? error.message : 'Admin session request failed',
            });
        }
        let envelope;
        try {
            envelope = await response.json();
        }
        catch {
            throw new AdminProviderError({
                code: 'INVALID_RESPONSE',
                message: 'Admin service returned invalid JSON',
            }, response.status);
        }
        if (!response.ok || !envelope || envelope.ok !== true) {
            const candidateError = envelope && envelope.ok === false ? envelope.error : undefined;
            throw new AdminProviderError(isAdminErrorDetails(candidateError)
                ? candidateError
                : { code: 'INVALID_RESPONSE', message: 'Admin service returned an invalid response' }, response.status);
        }
        if (!envelope.data || typeof envelope.data.sessionToken !== 'string' || envelope.data.sessionToken.length === 0) {
            throw new AdminProviderError({
                code: 'INVALID_RESPONSE',
                message: 'Admin service returned an invalid session',
            }, response.status);
        }
        return new LocalHttpAdminProvider({
            baseUrl,
            sessionToken: envelope.data.sessionToken,
            fetchImpl,
        });
    }
    constructor(options) {
        if (!options || typeof options.sessionToken !== 'string' || options.sessionToken.length === 0) {
            throw new TypeError('sessionToken must be a non-empty string');
        }
        this.baseUrl = resolveBaseUrl(options.baseUrl);
        this.sessionToken = options.sessionToken;
        this.fetchImpl = resolveFetch(options.fetchImpl);
    }
    listConfigs() {
        return this.request('/api/configs', { method: 'GET' });
    }
    readConfig(id) {
        return this.request(`/api/configs/${encodeURIComponent(id)}`, { method: 'GET' });
    }
    writeConfig(id, value, expectedRevision) {
        return this.writeRequest(`/api/configs/${encodeURIComponent(id)}`, 'PUT', { value, expectedRevision });
    }
    readCurrentCharacter() {
        return this.request('/api/character/current', { method: 'GET' });
    }
    writeCurrentCharacter(patch, expectedRevision) {
        return this.writeRequest('/api/character/current', 'PATCH', { patch, expectedRevision });
    }
    listBackups(target, id) {
        const query = new URLSearchParams({ target });
        if (id !== undefined)
            query.set('id', id);
        return this.request(`/api/backups?${query.toString()}`, { method: 'GET' });
    }
    restoreBackup(backupId, expectedRevision) {
        return this.writeRequest(`/api/backups/${encodeURIComponent(backupId)}/restore`, 'POST', { expectedRevision });
    }
    async writeRequest(pathname, method, body) {
        try {
            return await this.request(pathname, { method, body: JSON.stringify(body) });
        }
        catch (error) {
            if (error instanceof AdminProviderError)
                return { ok: false, error: error.toDetails() };
            throw error;
        }
    }
    async request(pathname, request) {
        const headers = {
            Accept: 'application/json',
            'X-Admin-Session-Token': this.sessionToken,
        };
        if (request.body !== undefined)
            headers['Content-Type'] = 'application/json';
        let response;
        try {
            response = await this.fetchImpl(`${this.baseUrl}${pathname}`, {
                method: request.method,
                headers,
                body: request.body,
                mode: 'same-origin',
                credentials: 'same-origin',
                redirect: 'error',
                cache: 'no-store',
            });
        }
        catch (error) {
            throw new AdminProviderError({
                code: 'NETWORK_ERROR',
                message: error instanceof Error ? error.message : 'Admin request failed',
            });
        }
        let envelope;
        try {
            envelope = await response.json();
        }
        catch {
            throw new AdminProviderError({
                code: 'INVALID_RESPONSE',
                message: 'Admin service returned invalid JSON',
            }, response.status);
        }
        if (!response.ok || !envelope || envelope.ok !== true) {
            const candidateError = envelope && envelope.ok === false ? envelope.error : undefined;
            const details = isAdminErrorDetails(candidateError)
                ? candidateError
                : { code: 'INVALID_RESPONSE', message: 'Admin service returned an invalid response' };
            throw new AdminProviderError(details, response.status);
        }
        if (!Object.prototype.hasOwnProperty.call(envelope, 'data')) {
            throw new AdminProviderError({
                code: 'INVALID_RESPONSE',
                message: 'Admin service returned an invalid response',
            }, response.status);
        }
        return envelope.data;
    }
}
