// Scrubs secrets and account identifiers from any text before it is printed or saved.
const WORKERS_DEV = /([a-z0-9-]+)\.([a-z0-9-]+)\.workers\.dev/gi;

export function buildRedactor({ secrets = [] } = {}) {
  const list = secrets.filter((s) => typeof s === 'string' && s.length > 0);
  return (text) => {
    let out = String(text);
    for (const secret of list) out = out.split(secret).join('<redacted>');
    return out.replace(WORKERS_DEV, '$1.<account-subdomain>.workers.dev');
  };
}
