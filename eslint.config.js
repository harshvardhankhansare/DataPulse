import js from '@eslint/js';
import typescriptESLint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
    js.configs.recommended,
    ...typescriptESLint.configs.recommended,
    {
        plugins: {
            'react-hooks': reactHooks
        },
        settings: {
            react: {
                version: 'detect'
            }
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            // Ignore build directories
            'no-restricted-syntax': ['error', {
                selector: 'TSInterfaceDeclaration[id.name=/.*Props$/]',
                message: 'Prefer type aliases over interfaces for props'
            }],
            // Allow console in development
            'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
            // TypeScript specific rules
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'off'
        },
        ignores: [
            'dist/',
            'release/',
            'node_modules/'
        ]
    }
];