// Registers jest-dom's matchers (toBeInTheDocument, etc.) globally, once,
// rather than importing it in every component test file. Loaded for every
// test file, component or not — a pure-function test just never calls a DOM
// matcher, so there's nothing to opt out of per file.
import "@testing-library/jest-dom";
