import js from '@eslint/js';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['dist/**', 'dist-test/**', 'src/generated/**'] },
  js.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['src/modules/**/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@nestjs/*',
            '@prisma/*',
            '**/infrastructure/**',
            'bullmq',
            'ioredis',
            'pg',
          ],
        },
      ],
    },
  },
);
