import "reflect-metadata";

export const aroundMethodDecarator = (
  decoratorFn: (
    args: any[],
    name: string,
    next: (..._args: any[]) => any
  ) => any
) => {
  return (_target: any, _key: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    const keys = Reflect.getOwnMetadataKeys(descriptor.value);

    const metadata = keys.map((key) => ({
      key,
      value: Reflect.getOwnMetadata(key, descriptor.value),
    }));

    descriptor.value = function (...args: any[]) {
      return decoratorFn(args, _key, originalMethod.bind(this));
    };

    metadata.forEach(({ key, value }) =>
      Reflect.defineMetadata(key, value, descriptor.value)
    );
  };
};
