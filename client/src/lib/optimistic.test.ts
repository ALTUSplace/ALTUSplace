import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { optimisticKeyId, optimisticMutation } from "./optimistic";

type Todo = { id: string; done: boolean };

const QUERY_KEY = ["todos"];

const append = (current: Todo[] | undefined, input: Todo): Todo[] => [
  ...(current ?? []),
  input,
];

const toggle = (current: Todo[] | undefined, input: { id: string }): Todo[] =>
  (current ?? []).map((todo) =>
    todo.id === input.id ? { ...todo, done: !todo.done } : todo,
  );

function setup(initial?: Todo[]): QueryClient {
  const queryClient = new QueryClient();
  if (initial) queryClient.setQueryData<Todo[]>(QUERY_KEY, initial);
  return queryClient;
}

describe("optimisticMutation", () => {
  it("cancels in-flight reads, snapshots the cache and writes optimistically", async () => {
    const queryClient = setup([{ id: "a", done: false }]);
    const cancelSpy = vi.spyOn(queryClient, "cancelQueries");
    const mutation = optimisticMutation<{ id: string }, Todo[]>({
      queryClient,
      queryKey: QUERY_KEY,
      update: toggle,
    });

    const context = await mutation.onMutate({ id: "a" });

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: QUERY_KEY });
    expect(queryClient.getQueryData<Todo[]>(QUERY_KEY)).toEqual([
      { id: "a", done: true },
    ]);
    expect(context.previous).toEqual([{ id: "a", done: false }]);
    expect(context.token).toBe(1);
    expect(context.keyId).toBe(optimisticKeyId(QUERY_KEY));
  });

  it("keeps the optimistic value on success and reconciles on settle", async () => {
    const queryClient = setup([{ id: "a", done: false }]);
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const mutation = optimisticMutation<{ id: string }, Todo[]>({
      queryClient,
      queryKey: QUERY_KEY,
      update: toggle,
    });

    const context = await mutation.onMutate({ id: "a" });
    await mutation.onSettled({ ok: true }, null, { id: "a" }, context);

    expect(queryClient.getQueryData<Todo[]>(QUERY_KEY)).toEqual([
      { id: "a", done: true },
    ]);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: QUERY_KEY });
  });

  it("rolls the cache back to the snapshot when the mutation fails", async () => {
    const queryClient = setup([{ id: "a", done: false }]);
    const onServerError = vi.fn();
    const mutation = optimisticMutation<{ id: string }, Todo[]>({
      queryClient,
      queryKey: QUERY_KEY,
      update: toggle,
      onServerError,
    });
    const failure = new Error("rejected");

    const context = await mutation.onMutate({ id: "a" });
    mutation.onError(failure, { id: "a" }, context);

    expect(queryClient.getQueryData<Todo[]>(QUERY_KEY)).toEqual([
      { id: "a", done: false },
    ]);
    expect(onServerError).toHaveBeenCalledWith(failure, { id: "a" });
  });

  it("drops the optimistic write when there was no cached value", async () => {
    const queryClient = setup();
    const mutation = optimisticMutation<Todo, Todo[]>({
      queryClient,
      queryKey: QUERY_KEY,
      update: append,
    });

    const context = await mutation.onMutate({ id: "a", done: false });
    expect(context.previous).toBeUndefined();
    expect(queryClient.getQueryData<Todo[]>(QUERY_KEY)).toEqual([
      { id: "a", done: false },
    ]);

    mutation.onError(new Error("rejected"), { id: "a", done: false }, context);
    expect(queryClient.getQueryData<Todo[]>(QUERY_KEY)).toBeUndefined();
  });

  it("never lets a stale failure clobber a newer optimistic write", async () => {
    const queryClient = setup();
    const mutation = optimisticMutation<Todo, Todo[]>({
      queryClient,
      queryKey: QUERY_KEY,
      update: append,
    });

    const first = await mutation.onMutate({ id: "a", done: false });
    const second = await mutation.onMutate({ id: "b", done: false });

    mutation.onError(new Error("stale"), { id: "a", done: false }, first);

    expect(second.token).toBeGreaterThan(first.token);
    // The newer write survives; the stale failure is a no-op on the cache.
    expect(queryClient.getQueryData<Todo[]>(QUERY_KEY)).toEqual([
      { id: "a", done: false },
      { id: "b", done: false },
    ]);
  });

  it("only the newest write may roll back", async () => {
    const queryClient = setup();
    const mutation = optimisticMutation<Todo, Todo[]>({
      queryClient,
      queryKey: QUERY_KEY,
      update: append,
    });

    const first = await mutation.onMutate({ id: "a", done: false });
    const second = await mutation.onMutate({ id: "b", done: false });
    mutation.onError(new Error("stale"), { id: "a", done: false }, first);
    mutation.onError(new Error("latest"), { id: "b", done: false }, second);

    // The newest write restores the snapshot it captured; the settle-time
    // refetch reconciles the cache with the server afterwards.
    expect(queryClient.getQueryData<Todo[]>(QUERY_KEY)).toEqual([
      { id: "a", done: false },
    ]);
  });

  it("can skip the settle-time invalidation", async () => {
    const queryClient = setup([{ id: "a", done: false }]);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const mutation = optimisticMutation<{ id: string }, Todo[]>({
      queryClient,
      queryKey: QUERY_KEY,
      update: toggle,
      invalidateOnSettled: false,
    });

    await mutation.onMutate({ id: "a" });
    await mutation.onSettled(undefined, null, { id: "a" }, undefined);

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("reports failures through onServerError even without a context", () => {
    const queryClient = setup();
    const onServerError = vi.fn();
    const mutation = optimisticMutation<Todo, Todo[]>({
      queryClient,
      queryKey: QUERY_KEY,
      update: append,
      onServerError,
    });
    const failure = new Error("offline");

    mutation.onError(failure, { id: "a", done: false }, undefined);

    expect(onServerError).toHaveBeenCalledWith(failure, {
      id: "a",
      done: false,
    });
  });

  it("scopes tokens per query key", async () => {
    const queryClient = setup();
    const first = optimisticMutation<Todo, Todo[]>({
      queryClient,
      queryKey: ["todos"],
      update: append,
    });
    const second = optimisticMutation<Todo, Todo[]>({
      queryClient,
      queryKey: ["listings"],
      update: append,
    });

    expect((await first.onMutate({ id: "a", done: false })).token).toBe(1);
    expect((await second.onMutate({ id: "b", done: false })).token).toBe(1);
  });
});

describe("optimisticKeyId", () => {
  it("is stable for structurally equal keys and distinct across keys", () => {
    expect(optimisticKeyId(["todos", 1])).toBe(optimisticKeyId(["todos", 1]));
    expect(optimisticKeyId(["todos"])).not.toBe(optimisticKeyId(["listings"]));
    expect(optimisticKeyId(["todos", 1])).not.toBe(optimisticKeyId(["todos", 2]));
  });
});
