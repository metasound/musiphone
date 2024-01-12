import ClientMuseria from 'museria-ms/dist/client/metasound.client.js';
const client = new ClientMuseria({ address: [], task: { workerChangeInterval: '1m' } });
export default client;