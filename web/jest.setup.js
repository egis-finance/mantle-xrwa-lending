import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Polyfills for viem/Web3 in Jest
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Fetch polyfills for Node.js
const crossFetch = require('cross-fetch')
global.fetch = crossFetch.default || crossFetch
global.Request = crossFetch.Request
global.Response = crossFetch.Response
global.Headers = crossFetch.Headers

// Load environment variables from .env.local for integration tests
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
