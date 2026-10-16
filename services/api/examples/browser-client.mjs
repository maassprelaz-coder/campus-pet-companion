// Copy/import this transport in B's web app. It never reads or stores the HttpOnly session token.
export function createTaskApi(baseUrl = 'http://127.0.0.1:8788') {
  const request = async (path, { body, key = crypto.randomUUID() } = {}) => {
    const response = await fetch(baseUrl + path, { credentials: 'include',
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(value.error?.message ?? '请求失败'), {
      status: response.status, code: value.error?.code, idempotencyKey: key });
    return value;
  };
  return {
    bootstrap: () => request('/api/v1/sessions', { body: {} }),
    state: () => request('/api/v1/session'),
    event: (body, key) => request('/api/v1/companion/events', { body, key }),
    accept: (suggestionId, key) => request('/api/v1/tasks/accept', { body: { suggestion_id: suggestionId }, key }),
    reject: (suggestionId, key) => request(`/api/v1/suggestions/${encodeURIComponent(suggestionId)}/reject`, { body: {}, key }),
    task: taskId => request(`/api/v1/tasks/${encodeURIComponent(taskId)}`),
    complete: (taskId, key) => request(`/api/v1/tasks/${encodeURIComponent(taskId)}/complete`, { body: {}, key }),
    preferences: (proactive, key) => request('/api/v1/preferences', { body: { proactive, remember: false }, key })
  };
}

// Display only: completion is decided by the API, never by this estimate.
export function remainingSeconds(task, serverTime, elapsedMs = 0) {
  return Math.max(0, Math.ceil((Date.parse(task.ends_at) - Date.parse(serverTime) - elapsedMs) / 1000));
}
