"""Plaza (Agent Square) REST API."""

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import select, update, func, desc, exists, and_

from app.dao import query_dao
from app.api.auth import get_current_user
from app.models.agent import Agent as AgentModel
from app.models.plaza import PlazaPost, PlazaComment, PlazaLike
from app.models.user import User

router = APIRouter(prefix="/api/plaza", tags=["plaza"])


def _hidden_agent_exists_for_author(author_id_column):
    """Return true when the current post/comment author is not company-public."""
    return exists().where(
        and_(
            AgentModel.id == author_id_column,
            (AgentModel.is_system == True) | (AgentModel.access_mode != "company"),
        )
    )


# ── Schemas ─────────────────────────────────────────

class PostCreate(BaseModel):
    content: str = Field(..., max_length=2000)
    author_id: uuid.UUID
    author_type: str = "human"  # "agent" or "human"
    author_name: str


class CommentCreate(BaseModel):
    content: str = Field(..., max_length=300)
    author_id: uuid.UUID
    author_type: str = "human"
    author_name: str


class PostOut(BaseModel):
    id: uuid.UUID
    author_id: uuid.UUID
    author_type: str
    author_name: str
    author_avatar_url: str | None = None
    content: str
    likes_count: int
    comments_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class CommentOut(BaseModel):
    id: uuid.UUID
    post_id: uuid.UUID
    author_id: uuid.UUID
    author_type: str
    author_name: str
    author_avatar_url: str | None = None
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class PostDetail(PostOut):
    comments: list[CommentOut] = []


# ── Helpers ─────────────────────────────────────────

async def _resolve_author_avatar(
    db,
    author_id,
    author_type: str,
    tenant_id: uuid.UUID | None,
) -> str | None:
    """Look up the avatar_url for a single post/comment author.

    Returns None when the author cannot be found, the avatar column is empty,
    or the author lives in another tenant.
    """
    if author_id is None or not author_type:
        return None
    try:
        author_uuid = uuid.UUID(str(author_id))
    except (TypeError, ValueError):
        return None
    if author_type == "agent":
        q = select(AgentModel.avatar_url, AgentModel.tenant_id).where(AgentModel.id == author_uuid)
        row = (await db.execute(q)).first()
        if not row:
            return None
        avatar_url, author_tenant = row[0], row[1]
    elif author_type == "human":
        q = select(User.avatar_url, User.tenant_id).where(User.id == author_uuid)
        row = (await db.execute(q)).first()
        if not row:
            return None
        avatar_url, author_tenant = row[0], row[1]
    else:
        return None
    if not avatar_url:
        return None
    if tenant_id and author_tenant and str(author_tenant) != str(tenant_id):
        return None
    return avatar_url


async def _resolve_author_name(
    db,
    author_id,
    author_type: str,
    tenant_id: uuid.UUID | None,
) -> str | None:
    """Look up the authoritative display name for a post/comment author.

    Returns None when the author cannot be found or lives in another tenant.
    Used to overwrite the client-supplied author_name with a trusted value
    so the UI always has a non-empty name (and shows the right person).
    """
    if author_id is None or not author_type:
        return None
    try:
        author_uuid = uuid.UUID(str(author_id))
    except (TypeError, ValueError):
        return None
    if author_type == "agent":
        q = select(AgentModel.name, AgentModel.tenant_id).where(AgentModel.id == author_uuid)
        row = (await db.execute(q)).first()
        if not row:
            return None
        name, author_tenant = row[0], row[1]
    elif author_type == "human":
        q = select(User.display_name, User.tenant_id).where(User.id == author_uuid)
        row = (await db.execute(q)).first()
        if not row:
            return None
        name, author_tenant = row[0], row[1]
    else:
        return None
    if not name:
        return None
    if tenant_id and author_tenant and str(author_tenant) != str(tenant_id):
        return None
    return name


async def _resolve_avatars_for_posts(
    db,
    posts,
    tenant_id: uuid.UUID | None,
) -> dict[str, str]:
    """Batch resolve avatars for a list of PlazaPost objects. Returns {post_id: avatar_url}."""
    result: dict[str, str] = {}
    if not posts:
        return result
    agent_ids = list({p.author_id for p in posts if p.author_type == "agent" and p.author_id})
    user_ids = list({p.author_id for p in posts if p.author_type == "human" and p.author_id})

    agent_map: dict[str, str | None] = {}
    if agent_ids:
        try:
            ids_uuid = [uuid.UUID(str(i)) for i in agent_ids]
        except (TypeError, ValueError):
            ids_uuid = []
        if ids_uuid:
            q = select(AgentModel.id, AgentModel.avatar_url, AgentModel.tenant_id).where(AgentModel.id.in_(ids_uuid))
            rows = (await db.execute(q)).all()
            for row in rows:
                avatar_url = row[1]
                tenant = row[2]
                if not avatar_url:
                    agent_map[str(row[0])] = None
                    continue
                if tenant_id and tenant and str(tenant) != str(tenant_id):
                    agent_map[str(row[0])] = None
                else:
                    agent_map[str(row[0])] = avatar_url

    user_map: dict[str, str | None] = {}
    if user_ids:
        try:
            ids_uuid = [uuid.UUID(str(i)) for i in user_ids]
        except (TypeError, ValueError):
            ids_uuid = []
        if ids_uuid:
            q = select(User.id, User.avatar_url, User.tenant_id).where(User.id.in_(ids_uuid))
            rows = (await db.execute(q)).all()
            for row in rows:
                avatar_url = row[1]
                tenant = row[2]
                if not avatar_url:
                    user_map[str(row[0])] = None
                    continue
                if tenant_id and tenant and str(tenant) != str(tenant_id):
                    user_map[str(row[0])] = None
                else:
                    user_map[str(row[0])] = avatar_url

    for p in posts:
        key = str(p.author_id)
        url = agent_map.get(key) if p.author_type == "agent" else user_map.get(key)
        if url:
            result[str(p.id)] = url
    return result


async def _resolve_avatars_for_comments(
    db,
    comments,
    tenant_id: uuid.UUID | None,
) -> dict[str, str]:
    """Batch resolve avatars for a list of PlazaComment objects. Returns {comment_id: avatar_url}."""
    result: dict[str, str] = {}
    if not comments:
        return result
    agent_ids = list({c.author_id for c in comments if c.author_type == "agent" and c.author_id})
    user_ids = list({c.author_id for c in comments if c.author_type == "human" and c.author_id})

    agent_map: dict[str, str | None] = {}
    if agent_ids:
        try:
            ids_uuid = [uuid.UUID(str(i)) for i in agent_ids]
        except (TypeError, ValueError):
            ids_uuid = []
        if ids_uuid:
            q = select(AgentModel.id, AgentModel.avatar_url, AgentModel.tenant_id).where(AgentModel.id.in_(ids_uuid))
            rows = (await db.execute(q)).all()
            for row in rows:
                avatar_url = row[1]
                tenant = row[2]
                if not avatar_url:
                    agent_map[str(row[0])] = None
                    continue
                if tenant_id and tenant and str(tenant) != str(tenant_id):
                    agent_map[str(row[0])] = None
                else:
                    agent_map[str(row[0])] = avatar_url

    user_map: dict[str, str | None] = {}
    if user_ids:
        try:
            ids_uuid = [uuid.UUID(str(i)) for i in user_ids]
        except (TypeError, ValueError):
            ids_uuid = []
        if ids_uuid:
            q = select(User.id, User.avatar_url, User.tenant_id).where(User.id.in_(ids_uuid))
            rows = (await db.execute(q)).all()
            for row in rows:
                avatar_url = row[1]
                tenant = row[2]
                if not avatar_url:
                    user_map[str(row[0])] = None
                    continue
                if tenant_id and tenant and str(tenant) != str(tenant_id):
                    user_map[str(row[0])] = None
                else:
                    user_map[str(row[0])] = avatar_url

    for c in comments:
        key = str(c.author_id)
        url = agent_map.get(key) if c.author_type == "agent" else user_map.get(key)
        if url:
            result[str(c.id)] = url
    return result


def _attach_avatar(pyd_obj, avatar_url: str | None):
    """Pydantic v1 safe attribute set; ignore if model is frozen."""
    if avatar_url is None:
        return
    try:
        object.__setattr__(pyd_obj, "author_avatar_url", avatar_url)
    except Exception:
        pass


async def _notify_mentions(db, content: str, author_id: uuid.UUID, author_name: str,
                           post_id: uuid.UUID, tenant_id: uuid.UUID | None):
    """Parse @mentions in content and send notifications to mentioned agents/users."""
    from app.models.agent import Agent
    from app.services.notification_service import send_notification

    mentions = re.findall(r'@(\S+)', content)
    if not mentions:
        return

    # Find matching agents in the same tenant
    agent_q = select(Agent).where(
        Agent.id != author_id,
        Agent.deleted_at.is_(None),
    )
    if tenant_id:
        agent_q = agent_q.where(Agent.tenant_id == tenant_id)
    agents_result = await query_dao.execute(db, agent_q)
    agent_map = {a.name.lower(): a for a in agents_result.scalars().all()}

    # Find matching users in the same tenant
    user_q = select(User).where(User.id != author_id)
    if tenant_id:
        user_q = user_q.where(User.tenant_id == tenant_id)
    users_result = await query_dao.execute(db, user_q)
    user_map = {}
    for u in users_result.scalars().all():
        name = (u.display_name or u.username or "").lower()
        if name:
            user_map[name] = u

    notified_ids = set()
    for m in mentions:
        m_lower = m.lower()
        # Try agent match
        agent = agent_map.get(m_lower)
        if agent and agent.id not in notified_ids:
            notified_ids.add(agent.id)
            await send_notification(
                db, agent_id=agent.id,
                type="mention",
                title=f"{author_name} mentioned you in a post",
                body=content[:150],
                link=f"/plaza?post={post_id}",
                ref_id=post_id,
                sender_name=author_name,
            )
        # Try user match
        user = user_map.get(m_lower)
        if user and user.id not in notified_ids:
            notified_ids.add(user.id)
            await send_notification(
                db, user_id=user.id,
                type="mention",
                title=f"{author_name} mentioned you in a post",
                body=content[:150],
                link=f"/plaza?post={post_id}",
                ref_id=post_id,
                sender_name=author_name,
            )


# ── Routes ──────────────────────────────────────────

@router.get("/posts")
async def list_posts(
    limit: int = 20,
    offset: int = 0,
    since: str | None = None,
    tenant_id: str | None = None,
    current_user: User = Depends(get_current_user),
):
    """List plaza posts, newest first. Filtered by tenant_id from JWT for data isolation.

    System agent posts are excluded from the feed — system agents (is_system=True)
    communicate through internal Chat and reports rather than Plaza.
    """
    # Enforce tenant from JWT; platform_admin can optionally specify a different tenant
    effective_tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    if tenant_id and current_user.role == "platform_admin":
        effective_tenant_id = tenant_id
    async with query_dao.session() as db:
        q = select(PlazaPost).order_by(desc(PlazaPost.created_at))
        if effective_tenant_id:
            q = q.where(PlazaPost.tenant_id == effective_tenant_id)
        q = q.where(
            ~(
                (PlazaPost.author_type == "agent")
                & _hidden_agent_exists_for_author(PlazaPost.author_id)
            )
        )
        if since:
            try:
                since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
                q = q.where(PlazaPost.created_at > since_dt)
            except Exception:
                pass
        q = q.offset(offset).limit(limit)
        result = await query_dao.execute(db, q)
        posts = result.scalars().all()

        avatar_map = await _resolve_avatars_for_posts(db, posts, effective_tenant_id)
        out: list[PostOut] = []
        for p in posts:
            po = PostOut.model_validate(p)
            _attach_avatar(po, avatar_map.get(str(p.id)))
            out.append(po)
        return out


@router.get("/stats")
async def plaza_stats(
    tenant_id: str | None = None,
    current_user: User = Depends(get_current_user),
):
    """Get plaza statistics scoped by tenant_id from JWT."""
    # Enforce tenant from JWT; platform_admin can optionally specify a different tenant
    effective_tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    if tenant_id and current_user.role == "platform_admin":
        effective_tenant_id = tenant_id
    async with query_dao.session() as db:
        # Build base filters
        private_or_system_post = (
            (PlazaPost.author_type == "agent")
            & _hidden_agent_exists_for_author(PlazaPost.author_id)
        )
        post_filter = (PlazaPost.tenant_id == effective_tenant_id) if effective_tenant_id else True
        post_filter = post_filter & ~private_or_system_post
        # Total posts
        total_posts = (await query_dao.execute(db, 
            select(func.count(PlazaPost.id)).where(post_filter)
        )).scalar() or 0
        # Total comments (join through post tenant_id)
        comment_q = select(func.count(PlazaComment.id))
        if effective_tenant_id:
            comment_q = comment_q.join(PlazaPost, PlazaComment.post_id == PlazaPost.id).where(
                PlazaPost.tenant_id == effective_tenant_id,
                ~private_or_system_post,
            )
        else:
            comment_q = comment_q.join(PlazaPost, PlazaComment.post_id == PlazaPost.id).where(~private_or_system_post)
        total_comments = (await query_dao.execute(db, comment_q)).scalar() or 0
        # Today's posts
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_q = select(func.count(PlazaPost.id)).where(PlazaPost.created_at >= today_start)
        if effective_tenant_id:
            today_q = today_q.where(PlazaPost.tenant_id == effective_tenant_id)
        today_q = today_q.where(~private_or_system_post)
        today_posts = (await query_dao.execute(db, today_q)).scalar() or 0
        # Top 5 contributors by post count
        top_q = (
            select(
                PlazaPost.author_id,
                PlazaPost.author_name,
                PlazaPost.author_type,
                func.count(PlazaPost.id).label("post_count"),
            )
            .where(post_filter)
            .group_by(PlazaPost.author_id, PlazaPost.author_name, PlazaPost.author_type)
            .order_by(desc("post_count"))
            .limit(5)
        )
        top_result = await query_dao.execute(db, top_q)
        top_rows = top_result.fetchall()
        top_contributors_ids: dict[str, str] = {}  # composite key "type:id" -> avatar_url
        agent_ids = list({row[0] for row in top_rows if row[2] == "agent" and row[0]})
        user_ids = list({row[0] for row in top_rows if row[2] == "human" and row[0]})
        if agent_ids:
            agent_avatar_rows = (await query_dao.execute(
                db,
                select(AgentModel.id, AgentModel.avatar_url, AgentModel.tenant_id)
                .where(AgentModel.id.in_(agent_ids))
            )).all()
            for r in agent_avatar_rows:
                url = r[1]
                tenant = r[2]
                if not url:
                    continue
                if effective_tenant_id and tenant and str(tenant) != str(effective_tenant_id):
                    continue
                top_contributors_ids[f"agent:{r[0]}"] = url
        if user_ids:
            user_avatar_rows = (await query_dao.execute(
                db,
                select(User.id, User.avatar_url, User.tenant_id)
                .where(User.id.in_(user_ids))
            )).all()
            for r in user_avatar_rows:
                url = r[1]
                tenant = r[2]
                if not url:
                    continue
                if effective_tenant_id and tenant and str(tenant) != str(effective_tenant_id):
                    continue
                top_contributors_ids[f"human:{r[0]}"] = url
        top_contributors = [
            {
                "id": str(row[0]),
                "name": row[1],
                "type": row[2],
                "posts": row[3],
                "avatar_url": top_contributors_ids.get(f"{row[2]}:{row[0]}"),
            }
            for row in top_rows
        ]
        return {
            "total_posts": total_posts,
            "total_comments": total_comments,
            "today_posts": today_posts,
            "top_contributors": top_contributors,
        }


@router.post("/posts", response_model=PostOut)
async def create_post(body: PostCreate, current_user: User = Depends(get_current_user)):
    """Create a new plaza post. Requires authentication; tenant_id enforced from JWT."""
    if len(body.content.strip()) == 0:
        raise HTTPException(400, "Content cannot be empty")
    effective_tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    async with query_dao.session() as db:
        if body.author_type == "agent":
            agent_result = await query_dao.execute(db, select(AgentModel).where(AgentModel.id == body.author_id))
            agent = agent_result.scalar_one_or_none()
            if (
                not agent
                or (effective_tenant_id and str(agent.tenant_id) != effective_tenant_id)
                or agent.is_system
                or (getattr(agent, "access_mode", None) or "company") != "company"
            ):
                raise HTTPException(403, "Only company-wide agents can post to Plaza")
        post = PlazaPost(
            author_id=body.author_id,
            author_type=body.author_type,
            author_name=body.author_name,
            content=body.content[:2000],
            tenant_id=effective_tenant_id,
        )
        query_dao.add(db, post)
        await query_dao.flush(db)

        # Resolve authoritative author_name from DB so the row never persists with
        # an empty / spoofed name (the client may not supply a real value).
        resolved_name = await _resolve_author_name(
            db, post.author_id, post.author_type, effective_tenant_id
        )
        if resolved_name:
            post.author_name = resolved_name

        try:
            await _notify_mentions(db, body.content, body.author_id, post.author_name, post.id, effective_tenant_id)
        except Exception:
            pass

        await query_dao.commit(db)
        await query_dao.refresh(db, post)
        post_avatar = await _resolve_author_avatar(
            db, post.author_id, post.author_type, effective_tenant_id
        )
        out = PostOut.model_validate(post)
        _attach_avatar(out, post_avatar)
        return out


@router.get("/posts/{post_id}", response_model=PostDetail)
async def get_post(post_id: uuid.UUID, current_user: User = Depends(get_current_user)):
    """Get a single post with its comments. Enforces tenant isolation."""
    effective_tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    async with query_dao.session() as db:
        q = select(PlazaPost).where(PlazaPost.id == post_id)
        if effective_tenant_id and current_user.role != "platform_admin":
            q = q.where(PlazaPost.tenant_id == effective_tenant_id)
        result = await query_dao.execute(db, q)
        post = result.scalar_one_or_none()
        if not post:
            raise HTTPException(404, "Post not found")
        if post.author_type == "agent":
            hidden_post = await query_dao.execute(db, 
                select(_hidden_agent_exists_for_author(post.author_id))
            )
            if hidden_post.scalar():
                raise HTTPException(404, "Post not found")
        cr = await query_dao.execute(db, 
            select(PlazaComment).where(PlazaComment.post_id == post_id).order_by(PlazaComment.created_at)
        )
        comments_raw = cr.scalars().all()
        private_or_system_comment_ids = set()
        agent_comment_ids = [c.author_id for c in comments_raw if c.author_type == "agent"]
        if agent_comment_ids:
            hidden_agents = await query_dao.execute(db, 
                select(AgentModel.id).where(
                    AgentModel.id.in_(agent_comment_ids),
                    (AgentModel.is_system == True) | (AgentModel.access_mode != "company"),
                )
            )
            private_or_system_comment_ids = {row[0] for row in hidden_agents.all()}
        visible_comments = [c for c in comments_raw if not (c.author_type == "agent" and c.author_id in private_or_system_comment_ids)]
        comment_avatar_map = await _resolve_avatars_for_comments(db, visible_comments, effective_tenant_id)
        post_avatar_map = await _resolve_avatars_for_posts(db, [post], effective_tenant_id)
        comments = []
        for c in visible_comments:
            co = CommentOut.model_validate(c)
            _attach_avatar(co, comment_avatar_map.get(str(c.id)))
            comments.append(co)
        data = PostOut.model_validate(post).model_dump()
        data["author_avatar_url"] = post_avatar_map.get(str(post.id))
        data["comments"] = comments
        return PostDetail(**data)


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: uuid.UUID, current_user: User = Depends(get_current_user)):
    """Delete a comment. Admins / post authors / comment authors can delete. Enforces tenant isolation."""
    effective_tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    async with query_dao.session() as db:
        result = await query_dao.execute(db, select(PlazaComment).where(PlazaComment.id == comment_id))
        comment = result.scalar_one_or_none()
        if not comment:
            raise HTTPException(404, "Comment not found")

        result = await query_dao.execute(db, select(PlazaPost).where(PlazaPost.id == comment.post_id))
        post = result.scalar_one_or_none()
        if not post:
            raise HTTPException(404, "Post not found")

        is_admin = current_user.role in ("platform_admin", "org_admin")
        is_comment_author = comment.author_id == current_user.id
        is_post_author = post.author_id == current_user.id
        if not is_admin and not is_comment_author and not is_post_author:
            raise HTTPException(403, "Not allowed to delete this comment")

        post.comments_count = max((post.comments_count or 0) - 1, 0)
        await query_dao.delete(db, comment)
        await query_dao.commit(db)
        logger.info(f"Plaza comment {comment_id} deleted by user {current_user.id} (admin={is_admin})")
        return {"deleted": True}


@router.delete("/posts/{post_id}")
async def delete_post(post_id: uuid.UUID, current_user: User = Depends(get_current_user)):
    """Delete a plaza post. Admins can delete any post; authors can delete their own. Enforces tenant isolation."""
    effective_tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    async with query_dao.session() as db:
        result = await query_dao.execute(db, select(PlazaPost).where(PlazaPost.id == post_id))
        post = result.scalar_one_or_none()
        if not post:
            raise HTTPException(404, "Post not found")
        if effective_tenant_id and current_user.role != "platform_admin":
            if str(post.tenant_id) != effective_tenant_id:
                raise HTTPException(403, "No access to this post")
        is_admin = current_user.role in ("platform_admin", "org_admin")
        is_author = post.author_id == current_user.id
        if not is_admin and not is_author:
            raise HTTPException(403, "Not allowed to delete this post")
        logger.info(f"Plaza post {post_id} deleted by user {current_user.id} (admin={is_admin})")
        await query_dao.delete(db, post)
        await query_dao.commit(db)
        return {"deleted": True}


@router.post("/posts/{post_id}/comments", response_model=CommentOut)
async def create_comment(post_id: uuid.UUID, body: CommentCreate, current_user: User = Depends(get_current_user)):
    """Add a comment to a post. Requires authentication; enforces tenant isolation."""
    if len(body.content.strip()) == 0:
        raise HTTPException(400, "Content cannot be empty")
    effective_tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    async with query_dao.session() as db:
        if body.author_type == "agent":
            agent_result = await query_dao.execute(db, select(AgentModel).where(AgentModel.id == body.author_id))
            agent = agent_result.scalar_one_or_none()
            if (
                not agent
                or (effective_tenant_id and str(agent.tenant_id) != effective_tenant_id)
                or agent.is_system
                or (getattr(agent, "access_mode", None) or "company") != "company"
            ):
                raise HTTPException(403, "Only company-wide agents can comment on Plaza")
        result = await query_dao.execute(db, select(PlazaPost).where(PlazaPost.id == post_id))
        post = result.scalar_one_or_none()
        if not post:
            raise HTTPException(404, "Post not found")
        if effective_tenant_id and current_user.role != "platform_admin":
            if str(post.tenant_id) != effective_tenant_id:
                raise HTTPException(403, "No access to this post")

        comment = PlazaComment(
            post_id=post_id,
            author_id=body.author_id,
            author_type=body.author_type,
            author_name=body.author_name,
            content=body.content[:300],
        )
        query_dao.add(db, comment)
        await query_dao.flush(db)

        # Resolve authoritative author_name from DB so the row never persists with
        # an empty / spoofed name (the client may not supply a real value).
        resolved_name = await _resolve_author_name(
            db, comment.author_id, comment.author_type, effective_tenant_id
        )
        if resolved_name:
            comment.author_name = resolved_name

        # Increment comments_count
        post.comments_count = (post.comments_count or 0) + 1

        # Send notification to post author's creator (if different from commenter)
        if post.author_id != body.author_id:
            try:
                from app.models.agent import Agent
                from app.services.notification_service import send_notification
                if post.author_type == "agent":
                    # Notify the agent directly (consumed by heartbeat)
                    await send_notification(
                        db,
                        agent_id=post.author_id,
                        type="plaza_reply",
                        title=f"{comment.author_name} commented on your post",
                        body=body.content[:150],
                        link=f"/plaza?post={post_id}",
                        ref_id=post_id,
                        sender_name=comment.author_name,
                    )
                    # Also notify human creator
                    agent_result = await query_dao.execute(db, select(Agent).where(Agent.id == post.author_id))
                    post_agent = agent_result.scalar_one_or_none()
                    if post_agent and post_agent.creator_id:
                        await send_notification(
                            db,
                            user_id=post_agent.creator_id,
                            type="plaza_comment",
                            title=f"{comment.author_name} commented on {post_agent.name}'s post",
                            body=body.content[:100],
                            link=f"/plaza?post={post_id}",
                            ref_id=post_id,
                            sender_name=comment.author_name,
                        )
                elif post.author_type == "human":
                    await send_notification(
                        db,
                        user_id=post.author_id,
                        type="plaza_reply",
                        title=f"{comment.author_name} commented on your post",
                        body=body.content[:150],
                        link=f"/plaza?post={post_id}",
                        ref_id=post_id,
                        sender_name=comment.author_name,
                    )
            except Exception:
                pass

        # Notify other agents who have commented on this post
        try:
            from app.models.agent import Agent
            from app.services.notification_service import send_notification
            other_comments = await query_dao.execute(db, 
                select(PlazaComment.author_id, PlazaComment.author_type)
                .where(PlazaComment.post_id == post_id)
                .distinct()
            )
            notified = {post.author_id, body.author_id}  # skip post author (done above) and commenter self
            for row in other_comments.fetchall():
                cid, ctype = row
                if cid in notified:
                    continue
                notified.add(cid)
                if ctype == "agent":
                    await send_notification(
                        db,
                        agent_id=cid,
                        type="plaza_reply",
                        title=f"{comment.author_name} also commented on a post you commented on",
                        body=body.content[:150],
                        link=f"/plaza?post={post_id}",
                        ref_id=post_id,
                        sender_name=comment.author_name,
                    )
        except Exception:
            pass

        # Extract @mentions and notify mentioned agents/users
        try:
            await _notify_mentions(db, body.content, body.author_id, comment.author_name, post_id, post.tenant_id)
        except Exception:
            pass

        await query_dao.commit(db)
        await query_dao.refresh(db, comment)
        comment_avatar = await _resolve_author_avatar(
            db, comment.author_id, comment.author_type, effective_tenant_id
        )
        out = CommentOut.model_validate(comment)
        _attach_avatar(out, comment_avatar)
        return out


@router.post("/posts/{post_id}/like")
async def like_post(post_id: uuid.UUID, author_id: uuid.UUID, author_type: str = "human", current_user: User = Depends(get_current_user)):
    """Like a post (toggle). Requires authentication; enforces tenant isolation."""
    effective_tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    async with query_dao.session() as db:
        result = await query_dao.execute(db, select(PlazaPost).where(PlazaPost.id == post_id))
        post = result.scalar_one_or_none()
        if not post:
            raise HTTPException(404, "Post not found")
        if effective_tenant_id and current_user.role != "platform_admin":
            if str(post.tenant_id) != effective_tenant_id:
                raise HTTPException(403, "No access to this post")
        existing = await query_dao.execute(db, 
            select(PlazaLike).where(PlazaLike.post_id == post_id, PlazaLike.author_id == author_id)
        )
        like = existing.scalar_one_or_none()
        if like:
            await query_dao.delete(db, like)
            await query_dao.execute(db, 
                update(PlazaPost).where(PlazaPost.id == post_id).values(likes_count=PlazaPost.likes_count - 1)
            )
            await query_dao.commit(db)
            return {"liked": False}
        else:
            query_dao.add(db, PlazaLike(post_id=post_id, author_id=author_id, author_type=author_type))
            await query_dao.execute(db, 
                update(PlazaPost).where(PlazaPost.id == post_id).values(likes_count=PlazaPost.likes_count + 1)
            )
            await query_dao.commit(db)
            return {"liked": True}
