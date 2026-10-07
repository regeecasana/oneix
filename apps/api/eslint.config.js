import base from "@oneix/config/eslint";

export default [
  ...base,
  {
    // Nest resolves constructor dependencies from emitted type metadata, which `import type` erases.
    rules: { "@typescript-eslint/consistent-type-imports": "off" },
  },
];
