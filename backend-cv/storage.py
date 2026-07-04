import os
from typing import Optional

import boto3
from botocore.config import Config


class S3Storage:
    def __init__(self):
        self.bucket = os.getenv("S3_BUCKET", "aegis-artifacts")
        self.region = os.getenv("S3_REGION", "us-east-1")
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = boto3.client(
                "s3",
                region_name=self.region,
                config=Config(
                    retries={"max_attempts": 3, "mode": "standard"},
                    connect_timeout=10,
                    read_timeout=30,
                ),
            )
        return self._client

    def generate_s3_key(self, session_id: str, artifact_type: str, filename: str) -> str:
        return f"sessions/{session_id}/{artifact_type}/{filename}"

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> str:
        client = self._get_client()
        client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )
        return key

    def upload_file(self, key: str, filepath: str, content_type: Optional[str] = None) -> str:
        client = self._get_client()
        extra_args = {"ServerSideEncryption": "AES256"}
        if content_type:
            extra_args["ContentType"] = content_type
        client.upload_file(filepath, self.bucket, key, ExtraArgs=extra_args)
        return key

    def generate_presigned_url(self, key: str, expires_in: int = 3600) -> str:
        client = self._get_client()
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )

    def delete_object(self, key: str) -> None:
        client = self._get_client()
        client.delete_object(Bucket=self.bucket, Key=key)

    def object_exists(self, key: str) -> bool:
        client = self._get_client()
        try:
            client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False
