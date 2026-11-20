ALTER TABLE returns ADD COLUMN IF NOT EXISTS source_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS returns_source_receipt_idx ON returns(source_receipt_id);

UPDATE goods_receipt_items gri SET batch_id=(
  SELECT sm.batch_id FROM goods_receipts gr JOIN stock_movements sm ON sm.reference_id=gr.id
  JOIN product_batches pb ON pb.id=sm.batch_id AND pb.product_id=gri.product_id
  WHERE gr.id=gri.receipt_id AND gr.status='closed' AND sm.movement_type IN ('purchase','adjustment')
    AND (gri.batch_number IS NULL OR pb.batch_number=gri.batch_number)
  ORDER BY sm.created_at DESC LIMIT 1
) WHERE gri.batch_id IS NULL;

INSERT INTO inventory_unit_serials(company_id,product_id,batch_id,inventory_id,serial_number,status,source_reference)
SELECT gr.company_id,gri.product_id,gri.batch_id,i.id,serial_number,
  CASE WHEN i.stock_status='quarantine' THEN 'quarantine' ELSE 'in_stock' END,gr.receipt_number
FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.id=gri.receipt_id
CROSS JOIN LATERAL jsonb_array_elements_text(gri.serial_numbers) serials(serial_number)
JOIN inventory i ON i.batch_id=gri.batch_id AND i.warehouse_id=gr.target_warehouse_id
WHERE gr.status='closed' AND gri.batch_id IS NOT NULL AND BTRIM(serial_number)<>''
ON CONFLICT(company_id,serial_number) DO NOTHING;

