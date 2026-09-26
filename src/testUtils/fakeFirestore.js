// A minimal in-memory stand-in for the pieces of the Firestore SDK this app uses.
// Good enough for exercising route/isolation logic without a real emulator.
export function createFakeFirestore() {
  const store = new Map(); // collectionName -> Map(docId -> data)
  let counter = 0;

  function collection(name) {
    if (!store.has(name)) store.set(name, new Map());
    const docs = store.get(name);

    const api = {
      doc(id) {
        return {
          async get() {
            const data = docs.get(id);
            return { exists: !!data, id, data: () => data };
          },
          async set(data, opts = {}) {
            const prev = opts.merge ? docs.get(id) || {} : {};
            docs.set(id, { ...prev, ...data });
          },
          async delete() {
            docs.delete(id);
          },
        };
      },
      async add(data) {
        const id = `doc_${++counter}`;
        docs.set(id, data);
        return { id };
      },
      where(field, op, value) {
        const filters = [[field, op, value]];
        const chain = {
          where(f, o, v) {
            filters.push([f, o, v]);
            return chain;
          },
          async get() {
            const results = [...docs.entries()].filter(([, data]) =>
              filters.every(([f, , v]) => data[f] === v)
            );
            return {
              docs: results.map(([id, data]) => ({ id, data: () => data })),
            };
          },
        };
        return chain;
      },
      async get() {
        return { docs: [...docs.entries()].map(([id, data]) => ({ id, data: () => data })) };
      },
    };
    return api;
  }

  return { collection };
}
