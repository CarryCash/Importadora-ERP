import Supplier360 from '../../Supplier360';

export default async function SupplierProfilePage({ params }: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = await params;
  return <Supplier360 supplierId={supplierId} />;
}
