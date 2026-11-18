from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from .main import get_session
from .backup import export_yaml, import_backup, parse_backup

router = APIRouter(prefix='/api/backup')


@router.get('/export')
def export(session: Session = Depends(get_session)):
    return Response(export_yaml(session), media_type='application/yaml; charset=utf-8', headers={'Content-Disposition': 'attachment; filename="bookdb-backup.yaml"'})


@router.post('/import')
async def restore(request: Request, mode: Literal['keep_existing', 'update_existing'] = 'keep_existing', preview: bool = False):
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > 10_000_000:
            raise HTTPException(413, 'Backup exceeds the 10 MB limit.')
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        raise HTTPException(422, 'Backup must be UTF-8 encoded.')

    def apply():
        data = parse_backup(text)
        with Session(request.app.state.engine) as session:
            session.connection().exec_driver_sql('BEGIN IMMEDIATE')
            try:
                result = import_backup(session, data, mode)
                if preview:
                    session.rollback()
                else:
                    session.commit()
                return dict(result, preview=preview)
            except IntegrityError:
                session.rollback()
                raise HTTPException(409, 'Backup conflicts with existing data. Nothing imported.')
    return await run_in_threadpool(apply)
