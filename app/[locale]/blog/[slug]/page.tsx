export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-charcoal-light">Post: {slug}</p>
    </div>
  );
}
