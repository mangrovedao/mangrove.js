export class ErrorWithData extends Error {
  public data: Object;

  constructor(message: string, data: Object) {
    // Fuckery to work around lack of TS support for extending Error
    const trueProto = new.target.prototype;
    super(message);
    Object.setPrototypeOf(this, trueProto);
    this.name = this.constructor.name;

    this.data = data;
  }
}
