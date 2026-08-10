module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  plugins: ['react', 'react-hooks', 'jsx-a11y'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    // Business Shield deliberately focuses the primary control when a modal/search
    // surface opens. Focus remains closable via keyboard in those surfaces.
    'jsx-a11y/no-autofocus': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // P14 is incremental: legacy JSX remains executable while product surfaces
      // are moved to TSX. New TSX keeps the full jsx-a11y ruleset; these specific
      // CRA-era findings are tracked for the final UX/a11y hardening pass.
      files: ['**/*.jsx'],
      rules: {
        'jsx-a11y/no-static-element-interactions': 'off',
        'jsx-a11y/no-noninteractive-element-to-interactive-role': 'off',
        'jsx-a11y/label-has-associated-control': 'off',
        'jsx-a11y/no-noninteractive-tabindex': 'off',
        'jsx-a11y/no-noninteractive-element-interactions': 'off',
        'jsx-a11y/click-events-have-key-events': 'off',
        'no-unused-vars': 'off',
      },
    },
    {
      files: ['**/*.js'],
      rules: {
        // Legacy service files are migrated to TypeScript incrementally.
        'no-useless-catch': 'off',
      },
    },
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended'],
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        'no-unused-vars': 'off',
      },
    },
    {
      files: ['**/*.test.*', '**/*.spec.*'],
      env: { browser: true, node: true },
      globals: {
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
        jest: 'readonly',
      },
    },
  ],
};
