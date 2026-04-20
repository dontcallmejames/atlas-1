import type { Command, CommandApi } from "@atlas/sdk";

export class CommandRegistry implements CommandApi {
  private readonly byId = new Map<string, Command>();

  register(command: Command): () => void {
    if (this.byId.has(command.id)) {
      throw new Error(`command already registered: ${command.id}`);
    }
    this.byId.set(command.id, command);
    return () => this.unregister(command.id);
  }

  unregister(id: string): void {
    this.byId.delete(id);
  }

  async invoke(id: string, args: string[] = []): Promise<void> {
    const command = this.byId.get(id);
    if (!command) {
      throw new Error(`unknown command: ${id}`);
    }
    await command.run(args);
  }

  list(): Command[] {
    return [...this.byId.values()];
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }
}
