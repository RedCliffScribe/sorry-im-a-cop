import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'output/**', 'test-results/**']
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      'no-undef': 'off',
      'prefer-const': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'none',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern:
            '^_|^(normalCategoryIcons|assetSearchText|createMemory|dialog|relationIdsForPatch|createRecentStorySummaryEntry|timeValue|compareRecentMemory|tieBreaker|stableId|defaultVitals|repairRelationshipThreads|repairPlayerVitals|repairPlayerClothing|repairAssetLifecycle|repairIncidentOrigins)$'
        }
      ]
    }
  }
);
