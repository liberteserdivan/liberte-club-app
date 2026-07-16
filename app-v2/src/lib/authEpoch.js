let authEpoch = 0;
export function getAuthEpoch() { return authEpoch; }
export function bumpAuthEpoch() { authEpoch += 1; return authEpoch; }
