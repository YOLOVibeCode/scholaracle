module.exports = {
  extends: ['../../.eslintrc.js'],
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  overrides: [
    {
      files: ['src/routes/seed/seed.ts'],
      rules: {
        'max-depth': ['error', 6],
        'max-lines-per-function': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
        complexity: ['warn', 90],
      },
    },
    {
      files: ['src/routes/students/students.ts'],
      rules: {
        'max-lines-per-function': ['warn', { max: 850, skipBlankLines: true, skipComments: true }],
        complexity: ['warn', 50],
      },
    },
  ],
};

