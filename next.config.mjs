import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    // @uniswap/v3-sdk@3.25.x is installed at the top level with an old bundle
    // format. Its ESM entry (`dist/v3-sdk.esm.js`) imports a nested sdk-core
    // whose ESM build is incomplete. Alias to the CJS bundle entry instead,
    // which is self-contained.
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      // @uniswap/v3-sdk@3.25.x ESM entry imports a nested sdk-core whose ESM
      // build is incomplete. Alias to the self-contained CJS bundle instead.
      "@uniswap/v3-sdk": path.join(
        __dirname,
        "node_modules/@uniswap/v3-sdk/dist/index.js"
      ),
      // @walletconnect/utils ships a nested viem in its own node_modules that
      // is missing files (errors/abi.js, actions/test/*). Redirect all imports
      // from that nested package to the root viem install.
      [path.join(
        __dirname,
        "node_modules/@walletconnect/utils/node_modules/viem"
      )]: path.join(__dirname, "node_modules/viem"),
      // socket.io-client ESM debug build has broken relative imports under Node —
      // alias to the CJS build which is complete.
      "socket.io-client": path.join(
        __dirname,
        "node_modules/socket.io-client/build/cjs/index.js"
      ),
      // uuid ESM browser build (used by @metamask/sdk) has broken relative
      // imports (validate.js imports ./regex.js which doesn't exist in the
      // esm-browser subdirectory). Alias to the CJS build instead.
      "uuid": path.join(__dirname, "node_modules/uuid/dist/index.js"),
    };
    return config;
  },
};

export default nextConfig;
