// Injection token — kept in its own file so module and service can both
// import it without creating a circular dependency (which breaks DI in
// webpack-bundled NestJS apps).
export const NOTES_CLIENT = 'NOTES_CLIENT';
