import LibraryDetailClient from './library-detail-client';

export default async function LibraryDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LibraryDetailClient documentId={Number(id)} />;
}
