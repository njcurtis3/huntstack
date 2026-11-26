/**
 * The state registry (packages/shared/src/states.json) for the website. Every website file imports
 * states from here.
 *
 * By relative path, not '@huntstack/shared/states': vite.config.ts loads stateGuide.ts and
 * migrationGroups.ts in Node at build time, and Vite leaves a workspace package for Node to import,
 * which can't run .ts. A relative path is bundled into the config instead.
 */
export * from '../../../../packages/shared/src/states'
