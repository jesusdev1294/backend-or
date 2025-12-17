import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LogDocument = Log & Document;

@Schema({ timestamps: true })
export class Log {
  @Prop({ required: true })
  service: string; // 'falabella', 'odoo', 'orchestrator'

  @Prop({ required: true })
  action: string; // 'webhook_received', 'stock_update', 'api_call', etc.

  @Prop({ required: true })
  status: string; // 'success', 'error', 'pending'

  @Prop({ type: Object })
  request: any; // Request data

  @Prop({ type: Object })
  response: any; // Response data

  @Prop({ type: Object })
  metadata: any; // Additional info (headers, query params, etc)

  @Prop()
  errorMessage?: string;

  @Prop()
  duration?: number; // Execution time in ms

  @Prop()
  orderId?: string; // Order reference

  @Prop()
  productSku?: string; // Product reference
}

export const LogSchema = SchemaFactory.createForClass(Log);
