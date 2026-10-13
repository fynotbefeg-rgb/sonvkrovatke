// Receives only objects obtained through authenticated Bot API polling.
// No HTTP listener, approval writes, avatar calls, Drive writes or rendering.
import {isVerifiedTelegramUpdate} from './telegram-bot-api.mjs';
import {validateManifest} from './approval-manifest.mjs';
import {handleVerifiedStart} from './telegram-start-controller.mjs';

const pageSize=10;
const displayId=id=>id.length>100?`${id.slice(0,97)}…`:id;
function authorized(update,ids) {
  if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!/^[1-9][0-9]{0,15}$/.test(id)))throw Error('Configure operator IDs');
  const event=update.callback_query??update.message;
  const chat=update.callback_query?event.message?.chat:event?.chat;
  const sender=event?.from?.id;
  return Number.isSafeInteger(sender)&&sender>0&&ids.includes(String(sender))&&chat?.type==='private'&&chat.id===sender?sender:null;
}
const controls=()=>({inline_keyboard:[[{text:'Утверждения Романа',callback_data:'panel:approvals:0'}],
  [{text:'Сейчас создаются',callback_data:'panel:production:0'}]]});
const pageControls=(kind,page,total)=>({inline_keyboard:[
  ...(page>0?[[{text:'Назад',callback_data:`panel:${kind}:${page-1}`}]]:[]),
  ...((page+1)*pageSize<total?[[{text:'Далее',callback_data:`panel:${kind}:${page+1}`}]]:[]),
  [{text:'Меню',callback_data:'panel:menu'}]]});
function currentApproved(data){const items=validateManifest(data);if(items.length>180||items.some(i=>i.status!=='approved'||Date.parse(i.approved_at)>Date.now()))throw Error('Current approved queue required');return items;}

export async function handleTelegramPanel(update,{api,queue,allowedOperatorIds,readCurrentApprovals}={}) {
  if(!isVerifiedTelegramUpdate(update))throw Error('Authenticated Telegram transport required');
  const actor=authorized(update,allowedOperatorIds);if(!actor)return {ignored:true};
  if(typeof readCurrentApprovals!=='function')throw Error('Authenticated approval reader required');
  const callback=update.callback_query;
  if(callback)await api.answer(callback.id);
  const data=callback?.data??update.message?.text;
  if(typeof data!=='string')return {ignored:true};
  if(data.startsWith('start:')) {
    let result;
    try {result=await handleVerifiedStart(update,{queue,allowedOperatorIds,readCurrentApprovals,provider:'manual_upload'});}
    catch {await api.send(actor,'Запуск заблокирован: утверждения изменились, кнопка устарела или Google недоступен. Открой /start заново.');return {blocked:true};}
    await api.send(actor,`Добавлено в очередь: ${result.created}.\nВсего вариантов в этом запросе: ${result.jobs.length}.\nОжидают исходников. Генерация аватара и монтаж этой кнопкой пока не запускаются.`,controls());
    return {created:result.created,generationAllowed:false,renderAllowed:false};
  }
  const match=/^panel:(approvals|production):(0|[1-9][0-9]{0,3})$/.exec(data);
  if(data==='/production'||match?.[1]==='production') {
    const page=match?Number(match[2]):0,total=queue.countJobs();
    if(page>Math.max(0,Math.ceil(total/pageSize)-1))return {ignored:true};
    const jobs=queue.listPanelJobs({limit:pageSize,offset:page*pageSize});
    const labels={waiting_for_manual_upload:'ожидает исходников',waiting_for_windows_worker:'ожидает Windows-исполнителя'};
    const text=jobs.length?jobs.map(j=>`${displayId(j.version_id)}: ${labels[j.state]??'статус исполнителя не подключён'}`).join('\n'):'В локальной очереди заданий нет.';
    await api.send(actor,`Очередь этого координатора: ${total}\n${text}\n\nГенератор и монтаж ещё не подключены; ожидающие задания не считаются создающимися роликами.`,pageControls('production',page,total));
    return {readOnly:true};
  }
  const approvals=data==='/approvals'||match?.[1]==='approvals';
  const menu=['/start','/run','panel:menu'].includes(data);
  if(!approvals&&!menu){await api.send(actor,'Открой /start, /approvals или /production.');return {ignored:true};}
  let current,items;
  try{current=await readCurrentApprovals();items=currentApproved(current);}
  catch{await api.send(actor,'Google недоступен или ответ не прошёл проверку. Сохранённые данные не использую для запуска.');return {blocked:true};}
  if(approvals) {
    const page=match?Number(match[2]):0;
    if(page>Math.max(0,Math.ceil(items.length/pageSize)-1))return {ignored:true};
    await api.send(actor,`Утверждённых вариантов: ${items.length}\n`+
      items.slice(page*pageSize,(page+1)*pageSize).map(i=>`${displayId(i.version_id)} · версия ${i.script_revision} · утверждён`).join('\n')+
      '\n\nИсточник отдаёт только утверждённые варианты. Отсутствие не означает отказ Романа. Отдельные статусы темы, основы и хуков пока не подключены.',pageControls('approvals',page,items.length));
    return {readOnly:true};
  }
  const keyboard=controls();
  if(items.length&&items.length<=90){const ticket=queue.createTicket(current,items.map(i=>i.version_id),String(actor));
    keyboard.inline_keyboard.unshift([{text:`Запустить: ${items.length}`,callback_data:ticket.callback_data}]);}
  await api.send(actor,`Утверждено вариантов: ${items.length}.\nКнопка ставит их в очередь без дублей; перед добавлением утверждения проверяются снова.\nГенерация и монтаж пока не подключены.`+
    (items.length>90?'\nЗа один запрос разрешено до 90 вариантов. Выбор поднабора ещё не подключён.':''),keyboard);
  return {menu:true};
}

export async function pollTelegramPanelOnce({api,botId,queue,...options}) {
  const updates=await api.updates(queue.telegramOffset(botId));
  for(const update of updates){await handleTelegramPanel(update,{api,queue,...options});queue.advanceTelegramOffset(botId,update.update_id+1);}
  return {processed:updates.length};
}
