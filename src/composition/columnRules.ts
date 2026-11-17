import {toPt,type ResolvedDocument,type Table} from './resolvedDocument.js';
import {resolveTableStroke} from './strokeStyle.js';

type Section=NonNullable<ResolvedDocument['sections']>[number];

/** The continuation belongs to the form's body region, rather than to a
 * synthetic row. A single grid gives both exports the same horizontal edges. */
export function columnRuleTable(section:Section,document:ResolvedDocument):Table|undefined {
    const table=document.nodes[section.rootIds[0]!];
    return table?.type==='table'&&table.props.extendVerticalBordersToBodyEnd ? table : undefined;
}

export function validColumnRuleScope(section:Section,document:ResolvedDocument):boolean {
    const enabled=section.rootIds.filter(id=>{
        const node=document.nodes[id];
        return node?.type==='table'&&node.props.extendVerticalBordersToBodyEnd;
    });
    if(!enabled.length)return true;
    const table=columnRuleTable(section,document);
    const footer=section.footer;
    const footerTable=footer?.nodes[footer.rootIds[0]!];
    if(!table||enabled.length!==1||section.role!=='body'||!footer||footerTable?.type!=='table'||
        section.footerMode!=='all'||footer.firstPageOnly?.length||footer.placement||
        footer.sizing?.mode==='fixed'||(footer.gap&&toPt(footer.gap)>0)||
        (section.header&&(section.headerMode!=='all'||section.header.firstPageOnly?.length))||
        section.rootIds.length!==1+(section.endingArea?.rootIds.length??0)||
        document.formatInstances?.some(instance=>instance.sectionId===section.sectionId&&instance.sizing.mode==='fixed')||
        table.columns.length<2||!table.rowIds.length||resolveTableStroke(table,'insideVertical').style!=='single')return false;
    const hasNoColumnMerges=(node:Table)=>node.rowIds.every(id=>{
        const row=document.nodes[id];
        return row?.type==='table-row'&&row.cellIds.every(cid=>{
            const cell=document.nodes[cid];
            return cell?.type==='table-cell'&&(cell.props.colSpan??1)===1;
        });
    });
    return hasNoColumnMerges(table)&&(section.endingArea?.rootIds??[]).every(id=>{
        const summary=document.nodes[id];
        return summary?.type==='table'&&summary.columns.length===table.columns.length&&
            summary.columns.every((column,i)=>Math.abs(toPt(column.width)-toPt(table.columns[i]!.width))<1e-6)&&hasNoColumnMerges(summary);
    });
}
