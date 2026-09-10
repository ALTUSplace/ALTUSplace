import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CornerDownLeft, Loader2, MessageSquare, Send, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLocaleForLanguage, useLanguage } from "@/contexts/LanguageContext";
import { startLogin } from "@/const";

const MAX_COMMENT_LENGTH = 2000;
const PAGE_SIZE = 20;

type ReplyItem = {
  id: number;
  parentId: number;
  body: string;
  authorName: string | null;
  createdAt: string | Date;
  isMine: boolean;
};

type CommentItem = {
  id: number;
  body: string;
  authorName: string;
  createdAt: string | Date;
  isMine: boolean;
  replies: ReplyItem[];
};

function formatCommentDate(value: string | Date, locale: string): string {
  const date = value instanceof Date ? value : new Date(value);
  try {
    return date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return date.toLocaleDateString();
  }
}

/**
 * Full listing comment thread (questions / answers / replies), one nesting
 * level deep, with loading / error / empty / pending states, a login-gated
 * composer and author/admin delete. Renders through the shared
 * `bg-background`/`text-*` tokens so it adapts to the active dark/light theme.
 */
export default function CommentSection({ listingId }: { listingId?: number }) {
  const { direction, language, t } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const [body, setBody] = useState("");
  const [replyTarget, setReplyTarget] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  // Keyset cursor for "load older" pagination; null = newest page.
  const [cursor, setCursor] = useState<number | null>(null);

  const locale = getLocaleForLanguage(language);
  const enabled = typeof listingId === "number" && listingId > 0;

  const commentsQuery = trpc.comments.listByListing.useQuery(
    { listingId: listingId ?? 0, limit: PAGE_SIZE, cursor: cursor ?? undefined },
    { enabled },
  );

  // Stable accumulated list: first (newest) page replaces, later pages append.
  const [rendered, setRendered] = useState<CommentItem[]>([]);
  useEffect(() => {
    if (!commentsQuery.data) return;
    if (cursor === null) {
      setRendered(commentsQuery.data.items);
    } else {
      setRendered((previous) => [...previous, ...commentsQuery.data.items]);
    }
  }, [commentsQuery.data]);

  const resetThread = async () => {
    setCursor(null);
    await commentsQuery.refetch();
  };

  const createComment = trpc.comments.create.useMutation({
    onSuccess: async () => {
      setBody("");
      setReplyBody("");
      setReplyTarget(null);
      await resetThread();
      toast.success(t("commentPosted"));
    },
    onError: (error) => toast.error(error.message || t("commentsLoadError")),
  });

  const removeComment = trpc.comments.remove.useMutation({
    onSuccess: async () => {
      await resetThread();
      toast.success(t("commentDeleted"));
    },
    onError: (error) => toast.error(error.message || t("commentsLoadError")),
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>, parentId: number | null) => {
    event.preventDefault();
    if (!isAuthenticated) {
      toast.info(t("loginToComment"));
      return;
    }
    const value = parentId === null ? body : replyBody;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_COMMENT_LENGTH) return;
    createComment.mutate(
      parentId === null
        ? { listingId: listingId!, body: trimmed }
        : { listingId: listingId!, body: trimmed, parentId },
    );
  };

  const handleDelete = (commentId: number) => {
    if (!window.confirm(t("deleteCommentConfirm"))) return;
    removeComment.mutate({ commentId });
  };

  const canDelete = (item: { isMine: boolean }) =>
    item.isMine || user?.role === "admin";

  const count = rendered.reduce((sum, comment) => sum + 1 + comment.replies.length, 0);

  return (
    <section className="my-12 space-y-6" dir={direction} aria-label={t("commentsTitle")}>
      <div className="flex flex-col items-start justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="flex items-center gap-2 text-2xl font-bold">
            <MessageSquare className="h-6 w-6 text-primary" /> {t("commentsTitle")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("commentsSubtitle")}</p>
        </div>
        {count > 0 && (
          <Badge className="gap-1 bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">
            {count} {t("commentsCountSuffix")}
          </Badge>
        )}
      </div>
{/* Composer */}
      {isAuthenticated ? (
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <form
              onSubmit={(event) => handleSubmit(event, null)}
              className="space-y-3"
              aria-label={t("writeCommentPlaceholder")}
            >
              <label htmlFor="comment-section-body" className="sr-only">
                {t("writeCommentPlaceholder")}
              </label>
              <textarea
                id="comment-section-body"
                rows={3}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t("writeCommentPlaceholder")}
                maxLength={MAX_COMMENT_LENGTH}
                className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {body.length}/{MAX_COMMENT_LENGTH}
                </span>
                <Button type="submit" size="sm" className="gap-1.5 font-bold" disabled={createComment.isPending || body.trim().length === 0}>
                  {createComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {createComment.isPending ? t("postingComment") : t("postComment")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border shadow-sm">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="font-bold">{t("loginToComment")}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("loginToCommentDesc")}</p>
            </div>
            <Button onClick={() => startLogin()} className="shrink-0 font-bold">
              {t("loginAction")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Thread states */}
      {commentsQuery.isLoading && rendered.length === 0 && (
        <Card className="border-border shadow-sm" role="status" aria-live="polite">
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("commentsLoading")}
          </CardContent>
        </Card>
      )}

      {commentsQuery.isError && (
        <Card className="border-rose-200 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-6 text-sm text-rose-600">
            <span>{t("commentsLoadError")}</span>
            <Button variant="outline" size="sm" onClick={() => commentsQuery.refetch()}>
              {t("commentRetry")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!commentsQuery.isLoading && !commentsQuery.isError && rendered.length === 0 && (
        <Card className="border-border shadow-sm">
          <CardContent className="p-6 text-sm text-muted-foreground">{t("noComments")}</CardContent>
        </Card>
      )}
<div className="space-y-4">
        {rendered.map((comment) => (
          <div key={comment.id}>
            <Card className="border-border shadow-sm">
              <CommentHeader name={comment.authorName} createdAt={comment.createdAt} locale={locale} />
              <CardContent className="p-5 pt-3">
                <p className="text-sm whitespace-pre-line text-foreground">{comment.body}</p>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTarget(replyTarget === comment.id ? null : comment.id);
                      setReplyBody("");
                    }}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    aria-expanded={replyTarget === comment.id}
                  >
                    <CornerDownLeft className="h-3.5 w-3.5" /> {t("commentReply")}
                  </button>
                  {canDelete(comment) && (
                    <button
                      type="button"
                      onClick={() => handleDelete(comment.id)}
                      className="inline-flex items-center gap-1 text-rose-600 hover:underline"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("deleteComment")}
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Nested replies */}
            {comment.replies.map((reply) => (
              <Card key={reply.id} className="my-2 border-border shadow-sm md:mx-6">
                <CommentHeader
                  name={reply.authorName || t("commentAuthorAnonymous")}
                  createdAt={reply.createdAt}
                  locale={locale}
                  badge={reply.isMine ? t("commentAuthorYou") : undefined}
                />
                <CardContent className="p-5 pt-3">
                  <p className="text-sm whitespace-pre-line text-foreground">{reply.body}</p>
                  {canDelete(reply) && (
                    <button
                      type="button"
                      onClick={() => handleDelete(reply.id)}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-rose-600 hover:underline"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("deleteComment")}
                    </button>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* Reply composer */}
            {replyTarget === comment.id && (
              <Card className="my-2 border-border shadow-sm md:mx-6">
                <CardContent className="p-4">
                  <form onSubmit={(event) => handleSubmit(event, comment.id)} className="space-y-2">
                    <label htmlFor={`comment-reply-${comment.id}`} className="sr-only">
                      {t("replyPlaceholder")}
                    </label>
                    <textarea
                      id={`comment-reply-${comment.id}`}
                      rows={2}
                      value={replyBody}
                      onChange={(event) => setReplyBody(event.target.value)}
                      placeholder={t("replyPlaceholder")}
                      maxLength={MAX_COMMENT_LENGTH}
                      className="w-full rounded-xl border border-border bg-background p-2.5 text-sm text-foreground"
                    />
                    <div className="flex items-center justify-between">
                      <Button variant="ghost" size="sm" type="button" onClick={() => setReplyTarget(null)}>
                        {t("cancelReply")}
                      </Button>
                      <Button type="submit" size="sm" className="gap-1.5 font-bold" disabled={createComment.isPending || replyBody.trim().length === 0}>
                        {createComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {t("commentReply")}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        ))}
      </div>

      {commentsQuery.data?.nextCursor ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => setCursor(commentsQuery.data.nextCursor)}
            disabled={commentsQuery.isLoading}
          >
            {commentsQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {t("loadMoreComments")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function CommentHeader({
  name,
  createdAt,
  locale,
  badge,
}: {
  name: string;
  createdAt: string | Date;
  locale: string;
  badge?: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-row items-center justify-between gap-3 px-5 pb-0 pt-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary" aria-hidden="true">
          <User className="h-4 w-4" />
        </div>
        <div>
          <h4 className="flex items-center gap-1.5 font-bold">
            {name}
            {badge && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {t("commentAuthorYou")}
              </span>
            )}
          </h4>
          <span className="text-xs text-muted-foreground">{formatCommentDate(createdAt, locale)}</span>
        </div>
      </div>
    </div>
  );
}