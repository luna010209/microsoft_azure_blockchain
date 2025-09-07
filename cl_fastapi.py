# -*- coding: utf-8 -*-
"""
## Test Transaction with ledger
"""

from azure.confidentialledger import ConfidentialLedgerClient
from azure.confidentialledger.certificate import ConfidentialLedgerCertificateClient
from azure.identity import ClientSecretCredential

tenant_id = "<tenant_id>"
client_id = "<client_id>"
client_secret = "<client_secret>"

ledger_name = "rl-confidential-ledger"
ledger_url = "https://rl-confidential-ledger.confidential-ledger.azure.com"
identity_url = "https://identity.confidential-ledger.core.azure.com"

# Authenticate
credential = ClientSecretCredential(tenant_id, client_id, client_secret)
print("Authentication successful!")

try:
    identity_client = ConfidentialLedgerCertificateClient(identity_url)
    network_identity = identity_client.get_ledger_identity(ledger_id=ledger_name)

    # Save network certificate into a file for later use
    ledger_tls_cert_file_name = "ledger_cert.pem"

    with open(ledger_tls_cert_file_name, "w") as cert_file:
        cert_file.write(network_identity["ledgerTlsCertificate"])

    ledger_client = ConfidentialLedgerClient(
        endpoint=ledger_url,
        credential=credential,
        ledger_certificate_path=ledger_tls_cert_file_name,
    )
    print("Confidential Ledger client created successfully!")

except Exception as e:
    print(f"Error during setup: {e}")
    raise

list(ledger_client.list_ledger_entries(collection_id='luna'))

import hashlib
def compute_sha256(file_path):
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        # Read and update hash string value in blocks of 4K
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def main(file_path, ledger_client):
    digest = compute_sha256(file_path)
    file_name = os.path.basename(file_path)
    print(f"Digest of the file '{file_path}': {digest}")

    receipt={'contents': json.dumps({"File Name": file_name, 'digest': digest})}
    create_entry_poller = ledger_client.create_ledger_entry(entry=receipt)
    return create_entry_poller

"""## FastAPI"""

from fastapi import FastAPI, UploadFile, Form, APIRouter, HTTPException,Query
from azure.core.exceptions import AzureError, ResourceNotFoundError
from pydantic import BaseModel
from typing import Optional
import nest_asyncio
import json

# Tool to run fastapi through google colab
import nest_asyncio
nest_asyncio.apply()

# FastAPI app
# app = FastAPI()
app = FastAPI(openapi_url="/openapi.json", docs_url="/docs")

ledger_router = APIRouter(prefix="/api/ledger", tags=["Ledger API"])

"""### POST"""

# Request DTO
class LedgerRequest(BaseModel):
    collectionId: Optional[str] = None
    content: str

@ledger_router.post("/upload/message")
async def upload_string(request: LedgerRequest):
    """
    Store a simple string message in Confidential Ledger.
    """
    entry = {"contents": request.content}
    try:
        result = ledger_client.create_ledger_entry(entry=entry, collection_id=request.collectionId)
        return {"status": "success", "result": result}

    except AzureError as e:
        # Catch all Azure SDK errors
        raise HTTPException(status_code=400, detail=f"Azure error: {str(e)}")

    except Exception as e:
        print(e.get_message())
        raise HTTPException(status_code=401, detail=f"Fail to create entry")


@ledger_router.post("/upload/file")
async def upload_file(file: UploadFile, collectionId: Optional[str] = Form(None)):
    """
    Store a file's content in Confidential Ledger (as string for demo).
    """
    # Read file bytes
    data = await file.read()
    file_name = file.filename
    file_content = data.decode("utf-8", errors="ignore")

    entry = {"contents": json.dumps({"File Name": file_name, "Content": file_content})}
    print("My entry", entry)
    try:
        result = ledger_client.create_ledger_entry(entry=entry, collection_id=collectionId)
        return {"status": "success", "result": result}

    except AzureError as e:
        # Catch all Azure SDK errors
        raise HTTPException(status_code=400, detail=f"Azure error: {str(e)}")

    except Exception as e:
        print(e.get_message())
        raise HTTPException(status_code=401, detail=f"Fail to create entry")

"""### GET"""

class LedgerEntryDTO(BaseModel):
    transactionId: str
    contents: str
    collectionId: str

@ledger_router.get("/",response_model=list[LedgerEntryDTO])
def list_entries(collectionId: Optional[str] = Query(None)):
    """
    Get all ledger entries
    """
    if collectionId:
        entries=ledger_client.list_ledger_entries(collection_id=collectionId)
    else:
        entries=ledger_client.list_ledger_entries()
    return [LedgerEntryDTO(**entry) for entry in entries]

@ledger_router.get("/{transactionId}", response_model=LedgerEntryDTO)
def get_entry(
    transactionId: str,  # path parameter
    collectionId: Optional[str] = Query(
        None, description="Optional collection ID to filter the ledger entry"
    )  # optional query parameter
):
    """
    Get a ledger entry by transactionId, optionally filtered by collectionId.
    """
    try:
        if collectionId:
            entry = ledger_client.get_ledger_entry(transactionId, collection_id=collectionId)
            if entry.get('state')=='Loading':
                ledger_client.get_ledger_entry(transactionId, collection_id=collectionId)
        # Default for colelctionId is subledger:0
        else:
            entry = ledger_client.get_ledger_entry(transactionId)  # default collection
            if entry.get('state')=='Loading':
                ledger_client.get_ledger_entry(transactionId)

        return LedgerEntryDTO(**entry['entry'])

    except ResourceNotFoundError as e:
        raise HTTPException(status_code=400, detail=f"Azure error: {str(e)}")

    except AzureError as e:
        raise HTTPException(status_code=400, detail=f"Azure error: {str(e)}")

app.include_router(ledger_router)

"""### Run in Google Colab"""

from pyngrok import ngrok
import uvicorn
import threading

from google.colab import userdata
token=userdata.get('MY_TOKEN')
public_url = ngrok.connect(8000, auth_token=token).public_url
print(f"Public URL: {public_url}")