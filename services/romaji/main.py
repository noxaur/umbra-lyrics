import os
import re
from typing import Literal

import cutlet
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="song-kara-romaji", version="1.0.0")

SYSTEMS: dict[str, str] = {
    "hepburn": "hepburn",
    "kunrei": "kunrei",
    "nippon": "nippon",
    "nihon": "nihon",
}

CUTLETS: dict[str, cutlet.Cutlet] = {}
JAPANESE_RE = re.compile(r"[\u3040-\u30ff\u4e00-\u9fff]")


class RomajiRequest(BaseModel):
    lines: list[str] = Field(min_length=1, max_length=500)
    system: Literal["hepburn", "kunrei", "nippon", "nihon"] = "hepburn"


class RomajiResponse(BaseModel):
    lines: list[str]
    system: str


def get_cutlet(system: str) -> cutlet.Cutlet:
    if system not in CUTLETS:
        CUTLETS[system] = cutlet.Cutlet(system)
    return CUTLETS[system]


def require_auth(authorization: str | None) -> None:
    api_key = os.environ.get("API_KEY", "").strip()
    if not api_key:
        return
    if authorization != f"Bearer {api_key}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def romanize_line(line: str, system: str) -> str:
    if not line.strip():
        return line
    if not JAPANESE_RE.search(line):
        return line
    return get_cutlet(system).romaji(line).lower()


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/romaji", response_model=RomajiResponse)
def romaji(
    body: RomajiRequest,
    authorization: str | None = Header(default=None),
) -> RomajiResponse:
    require_auth(authorization)
    system = SYSTEMS[body.system]
    lines = [romanize_line(line, system) for line in body.lines]
    return RomajiResponse(lines=lines, system=system)
