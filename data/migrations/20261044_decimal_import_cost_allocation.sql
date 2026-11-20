-- Perform cost allocation in NUMERIC arithmetic; do not calculate commercial amounts in JS floats.
CREATE OR REPLACE FUNCTION allocate_logistics_import_cost(p_company UUID,p_cost UUID,p_import UUID,p_policy VARCHAR)
RETURNS logistics_costs LANGUAGE plpgsql AS $$
DECLARE cost_row logistics_costs%ROWTYPE; amount_value NUMERIC(14,2); policy_value VARCHAR(16);
BEGIN
 SELECT * INTO cost_row FROM logistics_costs WHERE company_id=p_company AND id=p_cost FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Gasto logístico no encontrado.' USING ERRCODE='P0002'; END IF;
 IF cost_row.source_type<>'import' THEN RAISE EXCEPTION 'Solo los gastos de importación se pueden distribuir al costo de mercadería.' USING ERRCODE='22023'; END IF;
 IF cost_row.allocation_import_id IS NOT NULL THEN RAISE EXCEPTION 'Este costo ya fue distribuido.' USING ERRCODE='23505'; END IF;
 IF cost_row.ap_status='pending_approval' THEN RAISE EXCEPTION 'Autoriza primero el sobrecosto.' USING ERRCODE='55000'; END IF;
 IF NOT EXISTS(SELECT 1 FROM imports WHERE id=p_import AND company_id=p_company) THEN RAISE EXCEPTION 'Importación no encontrada para esta empresa.' USING ERRCODE='P0002'; END IF;
 amount_value:=COALESCE(NULLIF(cost_row.actual_amount,0),cost_row.estimated_amount);
 IF amount_value<=0 THEN RAISE EXCEPTION 'El gasto debe tener un importe estimado o real.' USING ERRCODE='22023'; END IF;
 policy_value:=CASE WHEN p_policy IN ('quantity','value','equal','weight') THEN p_policy ELSE 'value' END;
 IF NOT EXISTS(SELECT 1 FROM import_items ii JOIN products p ON p.id=ii.product_id AND p.company_id=p_company WHERE ii.import_id=p_import) THEN RAISE EXCEPTION 'La importación no contiene líneas válidas.' USING ERRCODE='P0002'; END IF;
 INSERT INTO logistics_cost_allocations(cost_id,import_item_id,allocated_amount,allocation_policy)
 WITH base AS (
  SELECT ii.id,ii.expected_quantity::NUMERIC quantity,
   CASE policy_value WHEN 'quantity' THEN ii.expected_quantity::NUMERIC WHEN 'weight' THEN ii.expected_quantity::NUMERIC*COALESCE(p.weight_kg,0)
    WHEN 'equal' THEN 1::NUMERIC ELSE ii.expected_quantity::NUMERIC*ii.unit_cost END raw_weight
  FROM import_items ii JOIN imports im ON im.id=ii.import_id JOIN products p ON p.id=ii.product_id
  WHERE ii.import_id=p_import AND im.company_id=p_company AND p.company_id=p_company
  ORDER BY ii.id FOR UPDATE OF ii
 ), weighted AS (
  SELECT *,SUM(raw_weight) OVER() total_weight,COUNT(*) OVER() line_count,ROW_NUMBER() OVER(ORDER BY id) line_number FROM base
 ), rounded AS (
  SELECT *,ROUND(amount_value*CASE WHEN total_weight=0 THEN 1 ELSE raw_weight END/CASE WHEN total_weight=0 THEN line_count ELSE total_weight END,4) rounded_amount FROM weighted
 ), shares AS (
  SELECT *,COALESCE(SUM(rounded_amount) OVER(ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) prior_amount FROM rounded
 )
 SELECT p_cost,id,CASE WHEN line_number=line_count THEN amount_value-prior_amount ELSE rounded_amount END,policy_value FROM shares;
 UPDATE import_items ii SET allocated_logistics_cost=ii.allocated_logistics_cost+a.amount,unit_cost=ii.unit_cost+a.amount/NULLIF(ii.expected_quantity,0)
 FROM (SELECT import_item_id,SUM(allocated_amount) amount FROM logistics_cost_allocations WHERE cost_id=p_cost GROUP BY import_item_id) a
 WHERE ii.id=a.import_item_id;
 UPDATE product_batches pb SET unit_cost=pb.unit_cost+a.unit_cost FROM (
  SELECT ii.product_id,SUM(lca.allocated_amount)/NULLIF(SUM(ii.expected_quantity),0) unit_cost
  FROM logistics_cost_allocations lca JOIN import_items ii ON ii.id=lca.import_item_id
  WHERE lca.cost_id=p_cost GROUP BY ii.product_id
 ) a WHERE pb.import_id=p_import AND pb.product_id=a.product_id;
 UPDATE imports SET total_cost=total_cost+amount_value,updated_at=NOW() WHERE id=p_import AND company_id=p_company;
 UPDATE logistics_costs SET allocation_import_id=p_import,allocation_policy=policy_value,updated_at=NOW()
 WHERE id=p_cost AND company_id=p_company RETURNING * INTO cost_row;
 RETURN cost_row;
END; $$;
