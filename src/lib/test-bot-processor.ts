// Test bot processor now uses the same flow as WhatsApp flow
// Re-export the main processing function from whatsapp-flow for consistency

export { processNumberedFlow as processTestFlow } from "./whatsapp-flow";
