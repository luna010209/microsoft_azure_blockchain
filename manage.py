import os
import dotenv
dotenv.load_dotenv()

# Get the environment variables
resource_group_name = os.getenv("resource_group_name")
ledger_name = os.getenv("ledger_name")
subscription_id = os.getenv("subscription_id")
identity_url = os.getenv("identity_url")
ledger_url = os.getenv("ledger_url")

tenant_id = os.getenv("tenant_id")
client_id = os.getenv("client_id")
client_secret = os.getenv("client_secret")

# Import the Azure authentication library
# Import the Azure authentication library

from azure.identity import DefaultAzureCredential

## Import the control plane sdk

from azure.mgmt.confidentialledger import ConfidentialLedger as ConfidentialLedgerAPI
from azure.mgmt.confidentialledger.models import ConfidentialLedger

# import the data plane sdk

from azure.confidentialledger import ConfidentialLedgerClient
from azure.confidentialledger.certificate import ConfidentialLedgerCertificateClient

credential = DefaultAzureCredential()
# credential = ClientSecretCredential(
#     tenant_id=tenant_id,
#     client_id=client_id,
#     client_secret=client_secret
# )

confidential_ledger_mgmt = ConfidentialLedgerAPI(
  credential, subscription_id
)


properties =  {
  "location": "southeastasia",
  "tags": {},
  "properties": {
    "ledgerType": "Public",
    "aadBasedSecurityPrincipals": [
      {
        "principalId": "ab56868d-63f3-498c-ac2b-b01842a04c4d",
        "tenantId": tenant_id,
        "ledgerRoleName": "Administrator"
      }
    ],
  },
}

ledger_properties = ConfidentialLedger(**properties)

confidential_ledger_mgmt.ledger.begin_create(resource_group_name, ledger_name, ledger_properties)

myledger = confidential_ledger_mgmt.ledger.get(resource_group_name, ledger_name)
print("Here are the details of your newly created ledger:")
print (f"- Name: {myledger.name}")
print (f"- Location: {myledger.location}")
print (f"- ID: {myledger.id}")


identity_client = ConfidentialLedgerCertificateClient(identity_url)
network_identity = identity_client.get_ledger_identity(
    ledger_id=ledger_name
)

# import base64
# ca_cert = base64.b64decode(network_identity['ledgerTlsCertificate'])
ledger_tls_cert_file_name = "networkcert.pem"
with open(ledger_tls_cert_file_name, "w") as cert_file:
    cert_file.write(network_identity['ledgerTlsCertificate'])

ledger_client = ConfidentialLedgerClient(
    endpoint=ledger_url, 
    credential=credential,
    ledger_certificate_path=ledger_tls_cert_file_name
)

sample_entry = {"contents": "Hello world!"}
append_result = ledger_client.create_ledger_entry(entry=sample_entry)
print(append_result['transactionId'])