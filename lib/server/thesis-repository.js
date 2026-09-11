import 'server-only';
import {createThesisStore,createMemoryThesisStore} from './thesis-store.js';
const local=process.env.NODE_ENV!=='production'&&process.env.BLS_PRIME_STORAGE_BACKEND==='memory';
// A single repository instance is shared by the thesis and capital API in local QA.
export const thesisRepository=local?(globalThis.__blsThesisRepository??=createMemoryThesisStore()):createThesisStore();
