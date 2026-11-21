// Runs the app's own modules in Node with a pretend local server held in memory.
// Nothing here touches your real data, the local data folder or Supabase.

// A pretend browser window, set as soon as this file loads, so any app module can be imported after it.
globalThis.window = globalThis.window || {
  location: { search: '?local', hash: '' },
  dispatchEvent: () => true,
  addEventListener: () => {},
};

export function installFakeServer(items = {}) {
  const server = { rev: 1, items: structuredClone(items), saves: 0 };
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path === 'api/rev') return reply(200, { rev: server.rev });
    if (path === 'api/data' && (!options.method || options.method === 'GET')) {
      return reply(200, { rev: server.rev, items: structuredClone(server.items) });
    }
    if (path === 'api/data' && options.method === 'PUT') {
      const body = JSON.parse(options.body);
      if (body.rev !== server.rev) return reply(409, { error: 'Changed on another device.' });
      server.items = body.items;
      server.rev += 1;
      server.saves += 1;
      return reply(200, { rev: server.rev });
    }
    return reply(404, { error: `No fake route for ${path}` });
  };
  return server;
}

// Loads the store once per test file and fills it from the fake server.
export async function loadApp(items) {
  const server = installFakeServer(items);
  const store = await import('../public/js/store.js');
  await store.load();
  return { server, store };
}

// Today in Cairo time, the same way the app works it out.
export async function today() {
  const { todayISO } = await import('../public/js/schema.js');
  return todayISO();
}
