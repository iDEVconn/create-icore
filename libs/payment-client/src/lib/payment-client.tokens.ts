// Injection token — kept in its own file so module and service can both
// import it without creating a circular dependency (which breaks DI in
// webpack-bundled NestJS apps).
export const PAYMENT_CLIENT = 'PAYMENT_CLIENT';
