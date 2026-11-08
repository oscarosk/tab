import { Buffer } from "buffer";
// web3.js / spl-token expect Node's Buffer in the browser.
(globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;
