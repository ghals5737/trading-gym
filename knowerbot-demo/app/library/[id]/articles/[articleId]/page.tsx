import ArticleDetailClient from './article-detail-client';

export default async function LibraryArticlePage({ params }: { params: Promise<{ id: string; articleId: string }> }) {
  const { id, articleId } = await params;
  return <ArticleDetailClient documentId={Number(id)} articleId={Number(articleId)} />;
}
