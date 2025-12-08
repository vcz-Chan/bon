import { ChatService } from './chat.service';

const chatService = new ChatService();

export class ChatPreviewService {
  async preview(question: string) {
    const { chunks, fallbackToSm, references } = await chatService.preview(question);
    return { chunks, fallbackToSm, references };
  }
}
