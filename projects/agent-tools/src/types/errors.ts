export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path?: string;
}

export interface ValidationErrorDetails {
  field: string;
  message: string;
}
