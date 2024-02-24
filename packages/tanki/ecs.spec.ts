import { describe, expect, it, vi } from "vitest";
import { containTag, not, single, tag, withProps, World } from "./ecs";

describe("ECS", () => {
  it("should create world", () => {
    const testEntity = { value: 0 };
    const testSystem = vi.fn((obj: any) => {
      obj.value += 1;
    });

    const world = new World()
      .addSystem(testSystem, [single(withProps("value"))])
      .addEntity(testEntity);

    world.run();

    expect(testSystem).toHaveBeenCalled();
    expect(testEntity.value).toBe(1);
  });
});

describe("ECS `withProps` util funciton", () => {
  it("should check produces", () => {
    const testEntity = { value: 0 };

    expect(withProps("value")(testEntity)).toBeTruthy();
    expect(withProps("value", "value2")(testEntity)).toBeFalsy();
    expect(withProps("constructor")(testEntity)).toBeFalsy();
  });

  it("should work with `not`", () => {
    const entity1 = { a: 0 };
    const entity2 = { a: 0, b: 0 };

    expect(withProps("a")(entity1)).toBeTruthy();
    expect(withProps("a")(entity2)).toBeTruthy();
    expect(withProps("a", not("b"))(entity1)).toBeTruthy();
    expect(withProps("a", not("b"))(entity2)).toBeFalsy();
  });
});

describe("ECS `tag` util funciton", () => {
  it("should set tag on object", () => {
    const a = tag("tag", { value: 0 });

    expect(containTag(a, "tag")).toBeTruthy();
  });
});
