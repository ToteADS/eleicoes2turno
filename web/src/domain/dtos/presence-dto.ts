/** Heartbeat sent to the API: the random id of this browser tab, nothing else. */
export class PresenceDto {
  constructor(readonly id: string) {}

  toJson(): { id: string } {
    return { id: this.id };
  }
}
